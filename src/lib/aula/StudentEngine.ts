/**
 * Motor do ALUNO. Recebe a aula do professor (ligação "descida") e, quando tem cadeira,
 * envia a sua câmara/microfone ao professor (ligação "subida").
 * Não depende do React nem do Supabase (recebe um "transport").
 */
import {
  AUDIO_CONSTRAINTS, ChatMsg, ClassState, HostMsg, LayoutEntry, StudentTransport, cleanText, uuid, waitIce,
} from "./protocol";

export type StudentStatus =
  | "esperando" // ligado ao canal, ainda sem sinal do professor
  | "ligando" // o professor está online; a negociar vídeo
  | "ligado"
  | "sem-sinal" // o professor deixou de responder
  | "encerrada" | "cheia" | "substituida" | "expulso";

const TERMINAL: StudentStatus[] = ["encerrada", "cheia", "substituida", "expulso"];
const SIGNAL_LOST_MS = 25_000;

export type StudentOptions = {
  transport: StudentTransport;
  rtc: RTCConfiguration;
  uid: string;
  nome: string;
  onChange?: () => void;
  onReact?: (k: string, from: string) => void;
  tickMs?: number;
  getMedia?: (mode: "av" | "audio") => Promise<MediaStream>; // para testes
};

export class StudentEngine {
  sid = uuid();
  status: StudentStatus = "esperando";
  state: ClassState | null = null;
  readonly streams = new Map<string, MediaStream>(); // recebidos do professor (inclui as cadeiras)
  chat: ChatMsg[] = [];
  myHand = false;
  local: MediaStream | null = null;
  error = "";

  private tx: StudentTransport;
  private rtc: RTCConfiguration;
  readonly uid: string;
  readonly nome: string;
  private onChange: () => void;
  private onReact?: (k: string, from: string) => void;
  private getMedia: (mode: "av" | "audio") => Promise<MediaStream>;
  private down?: RTCPeerConnection;
  private downV = 0;
  private up?: RTCPeerConnection;
  private upStarted = 0;
  private upBusy = false;
  private lastHost = 0;
  private lastJoin = 0;
  private timer?: ReturnType<typeof setInterval>;
  private tickMs: number;
  private stopped = false;

  constructor(o: StudentOptions) {
    this.tx = o.transport;
    this.rtc = o.rtc;
    this.uid = o.uid;
    this.nome = o.nome;
    this.onChange = o.onChange ?? (() => {});
    this.onReact = o.onReact;
    this.tickMs = o.tickMs ?? 3000;
    this.getMedia = o.getMedia ?? defaultGetMedia;
  }

  start() {
    this.stopped = false;
    this.tx.onHost((m) => this.onHost(m));
    this.sendJoin();
    this.timer = setInterval(() => this.tick(), this.tickMs);
    this.onChange();
  }

  /** Volta a pedir a aula depois de um estado final (encerrada, cheia, etc.). */
  rejoin() {
    this.teardown();
    this.sid = uuid();
    this.status = "esperando";
    this.state = null;
    this.chat = [];
    this.lastHost = 0;
    this.stopped = false;
    this.sendJoin();
    this.timer = setInterval(() => this.tick(), this.tickMs);
    this.onChange();
  }

  leave() {
    if (!this.stopped) this.tx.send({ t: "bye", sid: this.sid });
    this.teardown();
    this.tx.close();
  }

  // ───────────── estado para a interface ─────────────

  get iAmSeated() { return !!this.state?.seated.some((p) => p.uid === this.uid); }
  get mutedByHost() { return !!this.state?.muted.includes(this.uid); }
  get micOn() { return !!this.local?.getAudioTracks().some((t) => t.enabled); }
  get camOn() { return !!this.local?.getVideoTracks().some((t) => t.enabled); }
  get hasCam() { return !!this.local?.getVideoTracks().length; }
  get free() { return this.state ? Math.max(0, this.state.seats - this.state.seated.length) : 0; }

  /** Peças do ecrã: a imagem do professor e as cadeiras (com o stream, se já chegou). */
  stage(): { host: MediaStream | null; hostNome: string; seats: { uid: string; nome: string; stream: MediaStream | null; me: boolean }[] } {
    const layout = this.state?.layout ?? {};
    let host: MediaStream | null = null;
    const bySeat = new Map<string, MediaStream>();
    for (const [id, e] of Object.entries(layout) as [string, LayoutEntry][]) {
      const s = this.streams.get(id);
      if (!s) continue;
      if (e.role === "host") host = s;
      else if (e.uid) bySeat.set(e.uid, s);
    }
    const seats = (this.state?.seated ?? []).map((p) => ({
      uid: p.uid, nome: p.nome, me: p.uid === this.uid,
      stream: p.uid === this.uid ? this.local : bySeat.get(p.uid) ?? null,
    }));
    return { host, hostNome: this.state?.hostNome ?? "Professor", seats };
  }

  // ───────────── ações do aluno ─────────────

  hand(on: boolean) { this.myHand = on; this.tx.send({ t: "hand", sid: this.sid, on }); this.onChange(); }
  take() { this.tx.send({ t: "take", sid: this.sid }); }
  sendChat(texto: string, pergunta = false) {
    const t = cleanText(texto);
    if (t) this.tx.send({ t: "chat", sid: this.sid, texto: t, pergunta });
  }
  react(k: string) { this.tx.send({ t: "react", sid: this.sid, k }); }

  leaveSeat() {
    this.tx.send({ t: "leave-seat", sid: this.sid });
    this.stopMedia(false);
  }

  /** Liga câmara+microfone (ou só microfone). Chamar a partir de um clique. */
  async enableMedia(mode: "av" | "audio" = "av") {
    this.error = "";
    if (!this.iAmSeated) { this.error = "Ainda não tem cadeira."; this.onChange(); return; }
    try {
      this.local?.getTracks().forEach((t) => t.stop());
      this.local = await this.getMedia(mode);
      this.onChange();
      await this.startUp();
    } catch (e: any) {
      this.local = null;
      this.error = e?.name === "NotAllowedError" ? "Permissão negada. Autorize o microfone/câmara no navegador."
        : e?.name === "NotFoundError" ? "Não encontrei câmara ou microfone neste aparelho."
        : e?.message ?? "Não foi possível ligar o microfone/câmara.";
      this.onChange();
    }
  }
  toggleMic() { this.local?.getAudioTracks().forEach((t) => (t.enabled = !this.micOn)); this.onChange(); }
  toggleCam() { this.local?.getVideoTracks().forEach((t) => (t.enabled = !this.camOn)); this.onChange(); }

  // ───────────── mensagens do professor ─────────────

  private onHost(m: HostMsg) {
    if (this.stopped || !m || typeof m !== "object") return;
    switch (m.t) {
      case "state": {
        this.lastHost = Date.now();
        this.state = m.state;
        this.myHand = m.state.hands.some((p) => p.uid === this.uid);
        for (const id of [...this.streams.keys()]) if (!(id in m.state.layout) && !this.streams.get(id)!.active) this.streams.delete(id);
        if (!this.iAmSeated && (this.local || this.up)) this.stopMedia(false);
        else if (this.iAmSeated && this.local) this.ensureUp();
        if (this.joinNeeded() && Date.now() - this.lastJoin > 2000) this.sendJoin();
        this.refreshStatus();
        this.onChange();
        return;
      }
      case "offer":
        if (m.to === this.uid && m.sid === this.sid) void this.onOffer(m.v, m.sdp);
        return;
      case "up-answer":
        if (m.to === this.uid && m.sid === this.sid && this.up?.signalingState === "have-local-offer")
          this.up.setRemoteDescription(m.sdp).catch(() => {});
        return;
      case "welcome":
        if (m.to === this.uid && m.sid === this.sid && this.chat.length === 0) { this.chat = m.chat.slice(-100); this.onChange(); }
        return;
      case "chat":
        if (!this.chat.some((c) => c.id === m.msg.id)) { this.chat = [...this.chat.slice(-199), m.msg]; this.onChange(); }
        return;
      case "react": this.onReact?.(m.k, m.from); return;
      case "full": if (m.to === this.uid) this.finish("cheia"); return;
      case "replaced": if (m.to === this.uid && m.sid === this.sid) this.finish("substituida"); return;
      case "kick": if (m.to === this.uid) this.finish("expulso"); return;
      case "end": this.finish("encerrada"); return;
    }
  }

  private async onOffer(v: number, sdp: RTCSessionDescriptionInit) {
    try {
      if (v === 1) {
        this.closeDown();
        const pc = (this.down = new RTCPeerConnection(this.rtc));
        this.downV = 0;
        pc.ontrack = (e) => {
          const s = e.streams[0] ?? new MediaStream([e.track]);
          this.streams.set(s.id, s);
          this.onChange();
        };
        pc.onconnectionstatechange = () => {
          if (this.down !== pc) return;
          this.refreshStatus();
          this.onChange();
        };
      } else if (!this.down) {
        this.sendJoin(); // renegociação para uma ligação que já não temos: pede de novo
        return;
      }
      const pc = this.down!;
      if (v <= this.downV) return;
      this.downV = v;
      await pc.setRemoteDescription(sdp);
      await pc.setLocalDescription(await pc.createAnswer());
      if (v === 1) await waitIce(pc);
      if (this.down !== pc) return;
      this.tx.send({ t: "answer", sid: this.sid, v, sdp: { type: pc.localDescription!.type, sdp: pc.localDescription!.sdp } });
      this.refreshStatus();
    } catch {
      this.closeDown(); // o próximo "join" refaz a ligação
    }
  }

  // ───────────── subida (câmara/microfone → professor) ─────────────

  private ensureUp() {
    if (!this.local || this.upBusy) return;
    const st = this.up?.connectionState;
    if (this.up && st !== "failed" && st !== "closed" && st !== "disconnected") {
      if (st === "connected" || Date.now() - this.upStarted < 12_000) return;
    }
    void this.startUp();
  }

  private async startUp() {
    if (!this.local || this.upBusy || !this.iAmSeated) return;
    this.upBusy = true;
    try {
      this.closeUp(false);
      const local = this.local;
      const pc = (this.up = new RTCPeerConnection(this.rtc));
      this.upStarted = Date.now();
      local.getTracks().forEach((t) => pc.addTrack(t, local));
      pc.onconnectionstatechange = () => { if (this.up === pc) this.onChange(); };
      await pc.setLocalDescription(await pc.createOffer());
      pc.getSenders().forEach((s) => {
        if (s.track?.kind !== "video") return;
        try {
          const p = s.getParameters();
          if (!p.encodings?.length) return;
          p.encodings[0].maxBitrate = 350_000;
          s.setParameters(p).catch(() => {});
        } catch {}
      });
      await waitIce(pc);
      if (this.up !== pc) return;
      this.tx.send({ t: "up-offer", sid: this.sid, sdp: { type: pc.localDescription!.type, sdp: pc.localDescription!.sdp } });
    } catch {
      this.closeUp(false);
    } finally {
      this.upBusy = false;
    }
  }

  private closeUp(notify: boolean) {
    const had = !!this.up;
    this.up?.close();
    this.up = undefined;
    if (had && notify) this.tx.send({ t: "up-stop", sid: this.sid });
  }

  private stopMedia(notify: boolean) {
    this.closeUp(notify);
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
    this.onChange();
  }

  // ───────────── manutenção ─────────────

  private joinNeeded() {
    const st = this.down?.connectionState;
    if (!this.down || st === "failed" || st === "closed" || st === "disconnected") return true;
    return st !== "connected" && Date.now() - this.lastJoin > 12_000;
  }

  private sendJoin() {
    if (this.stopped) return;
    this.lastJoin = Date.now();
    this.tx.send({ t: "join", sid: this.sid, rebuild: !!this.down && this.down.connectionState !== "connected" });
  }

  private tick() {
    if (this.stopped) return;
    const now = Date.now();
    if (this.lastHost && now - this.lastHost < SIGNAL_LOST_MS && this.joinNeeded() && now - this.lastJoin > 5000) this.sendJoin();
    if (this.iAmSeated && this.local) this.ensureUp();
    this.refreshStatus();
  }

  private refreshStatus() {
    if (TERMINAL.includes(this.status)) return;
    let s: StudentStatus;
    if (!this.lastHost) s = "esperando";
    else if (Date.now() - this.lastHost > SIGNAL_LOST_MS) s = "sem-sinal";
    else s = this.down?.connectionState === "connected" ? "ligado" : "ligando";
    if (s !== this.status) { this.status = s; this.onChange(); }
  }

  private finish(s: StudentStatus) {
    this.teardown();
    this.status = s;
    this.onChange();
  }

  private closeDown() { this.down?.close(); this.down = undefined; this.downV = 0; }

  private teardown() {
    this.stopped = true;
    clearInterval(this.timer);
    this.stopMedia(false);
    this.closeDown();
    this.streams.clear();
    this.myHand = false;
  }
}

async function defaultGetMedia(mode: "av" | "audio") {
  return navigator.mediaDevices.getUserMedia(
    mode === "av"
      ? { audio: AUDIO_CONSTRAINTS, video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 }, facingMode: "user" } }
      : { audio: AUDIO_CONSTRAINTS },
  );
}
