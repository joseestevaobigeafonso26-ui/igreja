/**
 * Motor do PROFESSOR: faz de ponte entre os alunos.
 * Não depende do React nem do Supabase (recebe um "transport"), por isso pode ser testado sozinho.
 */
import {
  ChatMsg, ClassState, HostMsg, HostTransport, LayoutEntry, MAX_ALUNOS, MAX_SEATS, Modo, Person, REACTS,
  StudentMsg, cleanText, uuid, waitIce,
} from "./protocol";

type Peer = {
  uid: string;
  sid: string;
  nome: string;
  closed: boolean;
  // ligação "descida": professor → aluno (o professor é sempre quem oferece)
  down: RTCPeerConnection;
  hostSenders: { audio?: RTCRtpSender; video?: RTCRtpSender };
  seatSenders: Map<string, RTCRtpSender[]>; // uid do dono da cadeira → emissores nesta descida
  v: number;
  negotiating: boolean;
  dirty: boolean;
  pending?: { v: number; resolve: (ok: boolean) => void };
  // ligação "subida": aluno → professor (só enquanto tem cadeira)
  up?: RTCPeerConnection;
  upStream?: MediaStream;
  upTracks: MediaStreamTrack[];
  lastChat: number;
  lastReact: number[];
};

export type HostOptions = {
  transport: HostTransport;
  rtc: RTCConfiguration;
  hostNome: string;
  roster?: Person[];
  onChange?: () => void;
  onReact?: (k: string, from: string) => void;
  maxAlunos?: number;
  uplinkKbps?: number; // orçamento total de upload do professor
  heartbeatMs?: number;
  seatGraceMs?: number;
  answerTimeoutMs?: number;
};

const toInit = (d: RTCSessionDescription | null): RTCSessionDescriptionInit => ({ type: d!.type, sdp: d!.sdp });

export class HostEngine {
  readonly peers = new Map<string, Peer>();
  readonly chat: ChatMsg[] = [];
  hostStream: MediaStream | null = null;
  started = false;
  seats = 0;
  modo: Modo = "aprovar";
  readonly seated = new Set<string>();
  readonly hands = new Map<string, string>();
  readonly muted = new Set<string>();

  private tx: HostTransport;
  private rtc: RTCConfiguration;
  private roster = new Map<string, string>();
  private hostNome: string;
  private onChange: () => void;
  private onReact?: (k: string, from: string) => void;
  private maxAlunos: number;
  private uplinkKbps: number;
  private heartbeatMs: number;
  private graceMs: number;
  private answerTimeoutMs: number;
  private hb?: ReturnType<typeof setInterval>;
  private statePending = false;
  private grace = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(o: HostOptions) {
    this.tx = o.transport;
    this.rtc = o.rtc;
    this.hostNome = o.hostNome;
    this.onChange = o.onChange ?? (() => {});
    this.onReact = o.onReact;
    this.maxAlunos = o.maxAlunos ?? MAX_ALUNOS;
    this.uplinkKbps = o.uplinkKbps ?? 5000;
    this.heartbeatMs = o.heartbeatMs ?? 8000;
    this.graceMs = o.seatGraceMs ?? 60_000;
    this.answerTimeoutMs = o.answerTimeoutMs ?? 8000;
    (o.roster ?? []).forEach((p) => this.roster.set(p.uid, p.nome));
  }

  // ───────────── ciclo de vida ─────────────

  /** Começa a aula com a imagem/som do professor (já obtidos com um clique). */
  start(media: MediaStream) {
    if (this.started) return;
    this.started = true;
    this.hostStream = media;
    this.tx.onStudent((uid, m) => this.onStudent(uid, m));
    this.hb = setInterval(() => this.sendState(), this.heartbeatMs);
    this.sendState(true);
    this.onChange();
  }

  end() {
    if (!this.started) return;
    this.started = false;
    this.tx.send({ t: "end" });
    clearInterval(this.hb);
    this.grace.forEach(clearTimeout);
    this.grace.clear();
    [...this.peers.values()].forEach((p) => this.dropPeer(p, false, true));
    this.hostStream?.getTracks().forEach((t) => t.stop());
    this.hostStream = null;
    this.seated.clear(); this.hands.clear(); this.muted.clear();
    this.tx.close();
    this.onChange();
  }

  addMember(p: Person) {
    this.roster.set(p.uid, p.nome);
    this.tx.listen?.(p.uid);
  }

  // ───────────── controlos do professor ─────────────

  setSeats(n: number, modo: Modo) {
    this.seats = Math.max(0, Math.min(MAX_SEATS, Math.floor(Number(n) || 0)));
    this.modo = modo === "livre" ? "livre" : "aprovar";
    if (this.modo === "livre" || this.seats === 0) this.hands.clear();
    this.sendState(); this.onChange();
  }

  /** Dá a palavra a um aluno. Devolve uma mensagem de erro, ou null se correu bem. */
  approve(uid: string): string | null {
    if (this.seated.has(uid)) return null;
    if (this.seated.size >= this.seats) return "Não há cadeiras livres.";
    if (!this.peers.has(uid)) return "Esse aluno já saiu da aula.";
    this.seatUser(uid);
    return null;
  }
  decline(uid: string) { if (this.hands.delete(uid)) { this.sendState(); this.onChange(); } }
  revoke(uid: string) { this.unseat(uid); }
  mute(uid: string, on: boolean) {
    if (on) this.muted.add(uid); else this.muted.delete(uid);
    this.applyMute(uid);
    this.sendState(); this.onChange();
  }
  kick(uid: string) {
    const p = this.peers.get(uid);
    this.tx.send({ t: "kick", to: uid });
    if (p) this.dropPeer(p, false);
  }
  sendChat(texto: string, pergunta = false) {
    const t = cleanText(texto);
    if (!t) return;
    this.pushChat({ id: uuid(), uid: "host", nome: this.hostNome, texto: t, pergunta, host: true });
  }
  react(k: string) {
    if (REACTS.includes(k)) this.tx.send({ t: "react", k, from: "host" });
  }
  setUplinkKbps(k: number) { this.uplinkKbps = Math.max(500, k); this.applyBitrates(); }

  /** Troca o vídeo enviado (ex.: câmara ↔ partilha de ecrã) sem reiniciar as ligações. null = sem vídeo. */
  setVideo(track: MediaStreamTrack | null, opts?: { screen?: boolean }) {
    const hs = this.hostStream;
    if (!hs) return;
    hs.getVideoTracks().forEach((t) => hs.removeTrack(t));
    if (track) {
      try { (track as any).contentHint = opts?.screen ? "detail" : "motion"; } catch {}
      hs.addTrack(track);
    }
    for (const p of this.peers.values()) {
      const s = p.hostSenders.video;
      if (s) s.replaceTrack(track).catch(() => {});
      else if (track) { p.hostSenders.video = p.down.addTrack(track, hs); this.sync(p); }
    }
    this.applyBitrates();
    this.onChange();
  }

  // ───────────── estado para a interface ─────────────

  name(uid: string) { return this.roster.get(uid) ?? "Aluno"; }
  seatStream(uid: string) { return this.peers.get(uid)?.upStream ?? null; }
  connected() { return [...this.peers.values()].map((p) => ({ uid: p.uid, nome: p.nome })); }
  handsList(): Person[] { return [...this.hands].map(([uid, nome]) => ({ uid, nome })); }
  seatedList(): Person[] { return [...this.seated].map((uid) => ({ uid, nome: this.name(uid) })); }

  state(): ClassState {
    const layout: Record<string, LayoutEntry> = {};
    if (this.hostStream) layout[this.hostStream.id] = { role: "host", nome: this.hostNome };
    for (const uid of this.seated) {
      const s = this.peers.get(uid)?.upStream;
      if (s) layout[s.id] = { role: "seat", uid, nome: this.name(uid) };
    }
    return {
      seats: this.seats, modo: this.modo, seated: this.seatedList(), hands: this.handsList(),
      muted: [...this.muted], layout, alunos: this.peers.size, hostNome: this.hostNome, t: Date.now(),
    };
  }

  // ───────────── mensagens dos alunos ─────────────

  private onStudent(uid: string, m: StudentMsg) {
    if (!this.started || !m || typeof m !== "object") return;
    if (m.t === "join") return void this.onJoin(uid, String(m.sid), !!m.rebuild);
    const p = this.peers.get(uid);
    if (!p || p.sid !== m.sid) return; // mensagem de uma sessão antiga
    switch (m.t) {
      case "answer": return void this.onAnswer(p, m.v, m.sdp);
      case "up-offer": return void this.onUpOffer(p, m.sdp);
      case "up-stop": return void this.closeUp(p, true);
      case "hand":
        if (this.seated.has(uid) || this.modo !== "aprovar" || this.seats === 0) return;
        if (m.on) this.hands.set(uid, p.nome); else this.hands.delete(uid);
        this.sendState(); this.onChange(); return;
      case "take":
        if (this.modo === "livre" && !this.seated.has(uid) && this.seated.size < this.seats) this.seatUser(uid);
        return;
      case "leave-seat": return void this.unseat(uid);
      case "chat": {
        const now = Date.now();
        if (now - p.lastChat < 800) return; // anti-spam
        const t = cleanText(m.texto);
        if (!t) return;
        p.lastChat = now;
        this.pushChat({ id: uuid(), uid, nome: p.nome, texto: t, pergunta: !!m.pergunta, host: false });
        return;
      }
      case "react": {
        const now = Date.now();
        p.lastReact = p.lastReact.filter((x) => now - x < 2000);
        if (p.lastReact.length >= 4 || !REACTS.includes(m.k)) return;
        p.lastReact.push(now);
        this.tx.send({ t: "react", k: m.k, from: uid });
        this.onReact?.(m.k, uid);
        return;
      }
      case "bye": return void this.dropPeer(p, false);
    }
  }

  private onJoin(uid: string, sid: string, rebuild: boolean) {
    if (!sid) return;
    const old = this.peers.get(uid);
    if (old && old.sid === sid && !rebuild) {
      const st = old.down.connectionState;
      if (old.negotiating || st === "connected" || st === "connecting") {
        this.tx.send({ t: "welcome", to: uid, sid, chat: this.chat.slice(-30) });
        this.sendState();
        return; // pedido repetido: já estamos a tratar dele
      }
    }
    if (!old && this.peers.size >= this.maxAlunos) return void this.tx.send({ t: "full", to: uid });
    if (old) {
      if (old.sid !== sid) this.tx.send({ t: "replaced", to: uid, sid: old.sid });
      this.dropPeer(old, true);
    }
    const g = this.grace.get(uid);
    if (g) { clearTimeout(g); this.grace.delete(uid); }

    const down = new RTCPeerConnection(this.rtc);
    const p: Peer = {
      uid, sid, nome: this.name(uid), closed: false, down, hostSenders: {}, seatSenders: new Map(),
      v: 0, negotiating: false, dirty: false, upTracks: [], lastChat: 0, lastReact: [],
    };
    down.onconnectionstatechange = () => {
      if (this.peers.get(uid) !== p) return;
      if (down.connectionState === "failed" || down.connectionState === "closed") this.dropPeer(p, true);
      else { this.applyBitrates(); this.onChange(); }
    };
    // imagem/som do professor
    const hs = this.hostStream!;
    hs.getAudioTracks().forEach((t) => (p.hostSenders.audio = down.addTrack(t, hs)));
    hs.getVideoTracks().forEach((t) => (p.hostSenders.video = down.addTrack(t, hs)));
    // cadeiras que já estão a falar (menos a do próprio aluno)
    for (const o of this.peers.values()) this.addSeatTracks(o, p, undefined, false);
    this.peers.set(uid, p);

    this.tx.send({ t: "welcome", to: uid, sid, chat: this.chat.slice(-30) });
    this.sendState(); this.onChange();
    this.sync(p);
  }

  // ───────────── negociação da descida (o professor oferece) ─────────────

  private async sync(p: Peer) {
    if (p.closed) return;
    if (p.negotiating) { p.dirty = true; return; }
    p.negotiating = true;
    try {
      do {
        p.dirty = false;
        const pc = p.down;
        const v = ++p.v;
        await pc.setLocalDescription(await pc.createOffer());
        if (v === 1) await waitIce(pc);
        if (p.closed) return;
        const answered = new Promise<boolean>((resolve) => {
          const t = setTimeout(() => resolve(false), this.answerTimeoutMs);
          p.pending = { v, resolve: (ok) => { clearTimeout(t); resolve(ok); } };
        });
        this.tx.send({ t: "offer", to: p.uid, sid: p.sid, v, sdp: toInit(pc.localDescription) });
        if (!(await answered)) {
          if (this.peers.get(p.uid) === p) this.dropPeer(p, true); // sem resposta: o aluno volta a pedir
          return;
        }
        this.applyBitrates();
      } while (p.dirty && !p.closed);
    } catch {
      if (!p.closed && this.peers.get(p.uid) === p) this.dropPeer(p, true);
    } finally {
      p.negotiating = false;
    }
  }

  private async onAnswer(p: Peer, v: number, sdp: RTCSessionDescriptionInit) {
    if (!p.pending || p.pending.v !== v) return;
    const pend = p.pending;
    p.pending = undefined;
    try { await p.down.setRemoteDescription(sdp); pend.resolve(true); }
    catch { pend.resolve(false); }
  }

  // ───────────── subida (aluno → professor) e reenvio à turma ─────────────

  private async onUpOffer(p: Peer, sdp: RTCSessionDescriptionInit) {
    if (!this.seated.has(p.uid)) return; // só quem tem cadeira
    this.closeUp(p, false);
    const pc = new RTCPeerConnection(this.rtc);
    p.up = pc;
    pc.ontrack = (e) => {
      if (p.up !== pc) return;
      const s = e.streams[0] ?? p.upStream ?? new MediaStream();
      if (!e.streams[0]) s.addTrack(e.track);
      p.upStream = s;
      p.upTracks.push(e.track);
      if (e.track.kind === "audio" && this.muted.has(p.uid)) e.track.enabled = false;
      for (const q of this.peers.values()) this.addSeatTracks(p, q, [e.track]);
      this.sendState(); this.onChange();
    };
    pc.onconnectionstatechange = () => {
      if (p.up !== pc) return;
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.closeUp(p, true); // o aluno volta a ligar sozinho
      } else this.onChange();
    };
    try {
      await pc.setRemoteDescription(sdp);
      await pc.setLocalDescription(await pc.createAnswer());
      await waitIce(pc);
      if (p.up !== pc || p.closed) return;
      this.tx.send({ t: "up-answer", to: p.uid, sid: p.sid, sdp: toInit(pc.localDescription) });
    } catch {
      if (p.up === pc) this.closeUp(p, true);
    }
  }

  /** Passa as faixas da cadeira de `owner` para a descida de `to` (nunca devolve ao próprio dono). */
  private addSeatTracks(owner: Peer, to: Peer, only?: MediaStreamTrack[], sync = true) {
    if (owner.uid === to.uid || !owner.upStream || to.closed) return;
    const list = to.seatSenders.get(owner.uid) ?? [];
    for (const t of only ?? owner.upTracks) list.push(to.down.addTrack(t, owner.upStream));
    to.seatSenders.set(owner.uid, list);
    if (sync) this.sync(to);
  }

  private closeUp(p: Peer, notify: boolean) {
    const had = !!p.up || !!p.upStream;
    const pc = p.up;
    p.up = undefined;
    pc?.close();
    for (const q of this.peers.values()) {
      const list = q.seatSenders.get(p.uid);
      if (!list) continue;
      list.forEach((s) => { try { q.down.removeTrack(s); } catch {} });
      q.seatSenders.delete(p.uid);
      this.sync(q);
    }
    p.upStream = undefined;
    p.upTracks = [];
    if (had && notify) { this.sendState(); this.onChange(); }
  }

  private seatUser(uid: string) {
    this.seated.add(uid);
    this.hands.delete(uid);
    this.sendState(); this.onChange();
  }
  private unseat(uid: string) {
    const was = this.seated.delete(uid);
    this.muted.delete(uid);
    this.hands.delete(uid);
    const p = this.peers.get(uid);
    if (p) this.closeUp(p, false);
    if (was) { this.sendState(); this.onChange(); }
  }

  private applyMute(uid: string) {
    const p = this.peers.get(uid);
    const off = this.muted.has(uid);
    p?.upTracks.filter((t) => t.kind === "audio").forEach((t) => (t.enabled = !off));
  }

  // ───────────── saída de um aluno ─────────────

  private dropPeer(p: Peer, keepSeat: boolean, silent = false) {
    if (p.closed) return;
    this.closeUp(p, false);
    p.closed = true;
    p.pending?.resolve(false);
    try { p.down.close(); } catch {}
    if (this.peers.get(p.uid) === p) this.peers.delete(p.uid);
    this.hands.delete(p.uid);
    if (!keepSeat) { this.seated.delete(p.uid); this.muted.delete(p.uid); }
    else if (this.seated.has(p.uid) && !silent) {
      // queda de rede: guarda a cadeira um minuto para o aluno voltar sem perder a palavra
      const old = this.grace.get(p.uid); if (old) clearTimeout(old);
      this.grace.set(p.uid, setTimeout(() => {
        this.grace.delete(p.uid);
        if (!this.peers.has(p.uid) && this.seated.delete(p.uid)) { this.muted.delete(p.uid); this.sendState(); this.onChange(); }
      }, this.graceMs));
    }
    if (!silent) { this.applyBitrates(); this.sendState(); this.onChange(); }
  }

  // ───────────── chat, estado, qualidade ─────────────

  private pushChat(msg: ChatMsg) {
    this.chat.push(msg);
    if (this.chat.length > 200) this.chat.shift();
    this.tx.send({ t: "chat", msg });
    this.onChange();
  }

  private sendState(now = false) {
    if (!this.started) return;
    if (now) { this.tx.send({ t: "state", state: this.state() }); return; }
    if (this.statePending) return;
    this.statePending = true;
    setTimeout(() => {
      this.statePending = false;
      if (this.started) this.tx.send({ t: "state", state: this.state() });
    }, 30);
  }

  /** Reparte o upload do professor: quanto mais alunos, menos bitrate por ligação (a imagem do professor tem prioridade). */
  private applyBitrates() {
    const n = this.peers.size;
    if (!n) return;
    const per = this.uplinkKbps / n; // kbps por aluno
    for (const p of this.peers.values()) {
      const seatCount = p.seatSenders.size;
      const videoBudget = Math.max(100, per * 0.85);
      const weights = 3 + 2 * seatCount;
      const cap = (sender: RTCRtpSender | undefined, w: number, max: number) => {
        if (!sender) return;
        try {
          const params = sender.getParameters();
          if (!params.encodings?.length) return;
          params.encodings[0].maxBitrate = Math.round(Math.min(max, (videoBudget * w) / weights)) * 1000;
          sender.setParameters(params).catch(() => {});
        } catch {}
      };
      cap(p.hostSenders.video, 3, 1500);
      for (const list of p.seatSenders.values()) for (const s of list) if (s.track?.kind === "video") cap(s, 2, 400);
    }
  }
}
