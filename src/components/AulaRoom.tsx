"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Participant, Room, RoomEvent, Track } from "livekit-client";
import { supabase } from "@/lib/supabase";

type Meta = { seats: number; modo: "aprovar" | "livre" };
type ChatMsg = { id: string; nome: string; texto: string; pergunta: boolean; host: boolean };

const REACTS = ["👍", "❤️", "🙏", "🙌", "😮"];
const isHostP = (p: Participant) => { try { return JSON.parse(p.metadata || "{}").host === true; } catch { return false; } };
const parseMeta = (m?: string): Meta => {
  try { const j = JSON.parse(m || "{}"); return { seats: Number(j.seats) || 0, modo: j.modo === "livre" ? "livre" : "aprovar" }; }
  catch { return { seats: 0, modo: "aprovar" }; }
};

/** Um quadrado de vídeo (câmara ou ecrã partilhado) com nome e estado do microfone. */
function Tile({ p, big = false }: { p: Participant; big?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const screen = p.getTrackPublication(Track.Source.ScreenShare)?.track;
  const cam = p.getTrackPublication(Track.Source.Camera)?.track;
  const vt = screen ?? cam;
  useEffect(() => {
    const el = ref.current;
    if (!el || !vt) return;
    vt.attach(el);
    return () => { vt.detach(el); };
  }, [vt]);
  const showVideo = !!vt && !vt.isMuted;
  const mirror = p.isLocal && !screen;
  return (
    <div className={`relative overflow-hidden rounded-xl bg-slate-900 ${big ? "aspect-video" : "aspect-square"} ${p.isSpeaking ? "ring-2 ring-green-400" : ""}`}>
      <video ref={ref} autoPlay playsInline muted className={`h-full w-full ${screen ? "object-contain" : "object-cover"} ${showVideo ? "" : "hidden"}`}
        style={mirror ? { transform: "scaleX(-1)" } : undefined} />
      {!showVideo && (
        <div className="flex h-full items-center justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-700 text-xl font-bold text-white">
            {(p.name || "?").trim().slice(0, 1).toUpperCase()}
          </span>
        </div>
      )}
      <div className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
        {p.isMicrophoneEnabled ? "🎤" : "🔇"} {p.name || "Participante"}{p.isLocal ? " (você)" : ""}
      </div>
    </div>
  );
}

export default function AulaRoom({ salaId, nome }: { salaId: number; nome: string }) {
  const roomRef = useRef<Room | null>(null);
  const audioBox = useRef<HTMLDivElement>(null);
  const chatBox = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "connecting" | "live">("idle");
  const [err, setErr] = useState("");
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);
  const [meta, setMeta] = useState<Meta>({ seats: 0, modo: "aprovar" });
  const [isHost, setIsHost] = useState(false);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [hands, setHands] = useState<Record<string, string>>({});
  const [myHand, setMyHand] = useState(false);
  const [parts, setParts] = useState<{ id: number; e: string; x: number }[]>([]);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [texto, setTexto] = useState("");
  const [pergunta, setPergunta] = useState(false);
  const [seatsIn, setSeatsIn] = useState(0);
  const [modoIn, setModoIn] = useState<"aprovar" | "livre">("aprovar");
  const [busy, setBusy] = useState(false);
  const pid = useRef(0);

  const api = useCallback(async (path: string, body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ sala_id: salaId, ...body }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? "Erro.");
    return j;
  }, [salaId]);

  const seat = useCallback(async (action: string, identity?: string) => {
    setErr("");
    try { await api("/api/aula/seat", { action, identity }); } catch (e: any) { setErr(e.message); }
  }, [api]);

  useEffect(() => () => { roomRef.current?.disconnect(); }, []);
  useEffect(() => { if (chatBox.current) chatBox.current.scrollTop = chatBox.current.scrollHeight; }, [chat]);

  async function entrar() {
    setState("connecting"); setErr("");
    try {
      const j = await api("/api/aula/token", {});
      const room = new Room({
        adaptiveStream: true, dynacast: true,
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      roomRef.current = room;
      setIsHost(!!j.host);

      [RoomEvent.ParticipantConnected, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.LocalTrackPublished,
        RoomEvent.LocalTrackUnpublished, RoomEvent.ActiveSpeakersChanged, RoomEvent.TrackPublished, RoomEvent.TrackUnpublished,
      ].forEach((e) => room.on(e as any, bump));

      room.on(RoomEvent.ParticipantDisconnected, (p) => {
        setHands((h) => { const n = { ...h }; delete n[p.identity]; return n; });
        bump();
      });
      room.on(RoomEvent.ParticipantPermissionsChanged, (_prev, p) => {
        if (p.isLocal && p.permissions?.canPublish) setMyHand(false);
        setHands((h) => { const n = { ...h }; delete n[p.identity]; return n; });
        bump();
      });
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) audioBox.current?.appendChild(track.attach());
        bump();
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => { track.detach().forEach((el) => el.remove()); bump(); });
      room.on(RoomEvent.RoomMetadataChanged, (m) => { const mm = parseMeta(m); setMeta(mm); });
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => setAudioBlocked(!room.canPlaybackAudio));
      room.on(RoomEvent.Disconnected, () => {
        setState("idle"); roomRef.current = null; setHands({}); setMyHand(false); setChat([]);
        if (audioBox.current) audioBox.current.innerHTML = "";
      });
      room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        let d: any;
        try { d = JSON.parse(new TextDecoder().decode(payload)); } catch { return; }
        if (topic === "chat") {
          setChat((c) => [...c.slice(-199), {
            id: crypto.randomUUID(), nome: participant?.name || "Participante",
            texto: String(d.texto ?? "").slice(0, 300), pergunta: !!d.pergunta, host: participant ? isHostP(participant) : false,
          }]);
        } else if (topic === "react" && REACTS.includes(d.k)) {
          const id = ++pid.current;
          setParts((p) => [...p.slice(-25), { id, e: d.k, x: 8 + Math.random() * 80 }]);
          setTimeout(() => setParts((p) => p.filter((i) => i.id !== id)), 2500);
        } else if (topic === "hand" && participant) {
          setHands((h) => { const n = { ...h }; if (d.on) n[participant.identity] = participant.name || "Participante"; else delete n[participant.identity]; return n; });
        }
      });

      await room.connect(j.url, j.token);
      const m = parseMeta(room.metadata);
      setMeta(m); setSeatsIn(m.seats); setModoIn(m.modo);
      setState("live");
      room.startAudio().catch(() => setAudioBlocked(true));
    } catch (e: any) {
      roomRef.current?.disconnect(); roomRef.current = null;
      setState("idle"); setErr(e.message ?? "Não foi possível entrar na aula.");
    }
  }

  const room = roomRef.current;
  const me = room?.localParticipant;
  const all: Participant[] = room ? [room.localParticipant, ...Array.from(room.remoteParticipants.values())] : [];
  const hosts = all.filter(isHostP);
  const seated = all.filter((p) => !isHostP(p) && p.permissions?.canPublish);
  const mainHost =
    hosts.find((h) => h.getTrackPublication(Track.Source.ScreenShare)?.track) ??
    hosts.find((h) => h.getTrackPublication(Track.Source.Camera)?.track) ?? hosts[0];
  const iAmSeated = !!me && !isHost && !!me.permissions?.canPublish;
  const free = Math.max(0, meta.seats - seated.length);
  const handList = Object.entries(hands).filter(([id]) => all.some((p) => p.identity === id && !p.permissions?.canPublish));

  async function sendData(topic: string, obj: unknown, reliable = true) {
    await room?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(obj)), { reliable, topic });
  }
  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || !room) return;
    await sendData("chat", { texto: t, pergunta });
    setChat((c) => [...c.slice(-199), { id: crypto.randomUUID(), nome: "Você", texto: t.slice(0, 300), pergunta, host: isHost }]);
    setTexto(""); setPergunta(false);
  }
  async function react(k: string) {
    await sendData("react", { k }, false);
    const id = ++pid.current;
    setParts((p) => [...p.slice(-25), { id, e: k, x: 8 + Math.random() * 80 }]);
    setTimeout(() => setParts((p) => p.filter((i) => i.id !== id)), 2500);
  }
  async function toggleHand() {
    const on = !myHand; setMyHand(on);
    await sendData("hand", { on });
  }
  const toggle = async (what: "mic" | "cam" | "screen") => {
    if (!me) return;
    setErr("");
    try {
      if (what === "mic") await me.setMicrophoneEnabled(!me.isMicrophoneEnabled);
      else if (what === "cam") await me.setCameraEnabled(!me.isCameraEnabled);
      else await me.setScreenShareEnabled(!me.isScreenShareEnabled, { audio: true });
    } catch (e: any) { setErr(e.message ?? "Não foi possível usar o dispositivo."); }
    bump();
  };
  async function guardarCadeiras() {
    setBusy(true); setErr("");
    try { await api("/api/aula/seat", { action: "config", seats: seatsIn, modo: modoIn }); } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }
  async function encerrar() {
    if (!confirm("Encerrar a aula para todos?")) return;
    await seat("end");
  }

  const btn = "rounded-lg px-3 py-2 text-sm font-semibold";

  if (state !== "live") {
    return (
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h2 className="text-lg font-bold">{nome}</h2>
        <p className="text-sm text-slate-500">Ao entrar, os seus dados de acesso são verificados. Use fones para evitar eco.</p>
        <button onClick={entrar} disabled={state === "connecting"}
          className="rounded-lg bg-brand-terracotta px-6 py-3 font-bold text-white disabled:opacity-50">
          {state === "connecting" ? "A entrar…" : "Entrar na aula"}
        </button>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div ref={audioBox} className="hidden" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">{nome}</h2>
        <span className="badge-live rounded-full bg-brand-terracotta px-3 py-1 text-xs font-bold text-white">● AO VIVO · {all.length} na sala</span>
      </div>
      {audioBlocked && (
        <button onClick={() => room?.startAudio().then(() => setAudioBlocked(false))} className={`${btn} w-full bg-amber-400 text-slate-900`}>
          🔊 Toque aqui para ativar o som da aula
        </button>
      )}

      {/* Palco */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          {parts.map((p) => <span key={p.id} className="float-reaction absolute bottom-2 text-4xl" style={{ left: `${p.x}%` }}>{p.e}</span>)}
        </div>
        {mainHost ? <Tile p={mainHost} big /> : (
          <div className="flex aspect-video items-center justify-center rounded-xl bg-slate-900 p-6 text-center text-sm text-slate-400">
            {isHost ? "Ligue a câmara ou partilhe o ecrã abaixo." : "A aguardar o responsável iniciar a imagem…"}
          </div>
        )}
      </div>

      {/* Cadeiras */}
      {(meta.seats > 0 || seated.length > 0) && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold">🪑 Cadeiras ({seated.length}/{meta.seats})</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {seated.map((p) => <Tile key={p.identity} p={p} />)}
            {Array.from({ length: free }).map((_, i) => (
              <div key={i} className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-xs text-slate-400">🪑 livre</div>
            ))}
          </div>
        </div>
      )}

      {/* Controlos de quem dirige */}
      {isHost && (
        <div className="space-y-3 rounded-xl bg-slate-50 p-3">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => toggle("cam")} className={`${btn} ${me?.isCameraEnabled ? "bg-slate-800 text-white" : "bg-white border border-slate-300"}`}>
              📷 Câmara {me?.isCameraEnabled ? "ligada" : "desligada"}</button>
            <button onClick={() => toggle("mic")} className={`${btn} ${me?.isMicrophoneEnabled ? "bg-slate-800 text-white" : "bg-white border border-slate-300"}`}>
              🎤 Microfone {me?.isMicrophoneEnabled ? "ligado" : "desligado"}</button>
            <button onClick={() => toggle("screen")} className={`${btn} ${me?.isScreenShareEnabled ? "bg-slate-800 text-white" : "bg-white border border-slate-300"}`}>
              🖥️ {me?.isScreenShareEnabled ? "Parar partilha de ecrã" : "Partilhar ecrã"}</button>
            <button onClick={encerrar} className={`${btn} ml-auto bg-red-600 text-white`}>Encerrar aula</button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">Cadeiras:</span>
            <select value={seatsIn} onChange={(e) => setSeatsIn(Number(e.target.value))} className="rounded border border-slate-300 px-2 py-1">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <select value={modoIn} onChange={(e) => setModoIn(e.target.value as "aprovar" | "livre")} className="rounded border border-slate-300 px-2 py-1">
              <option value="aprovar">Eu aprovo cada pedido</option>
              <option value="livre">Livre (o primeiro a sentar fica)</option>
            </select>
            <button onClick={guardarCadeiras} disabled={busy} className={`${btn} bg-brand-terracotta text-white`}>Guardar</button>
          </div>
          {handList.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-sm font-bold">✋ Pedidos de cadeira</h4>
              {handList.map(([id, n]) => (
                <div key={id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{n}</span>
                  <button onClick={() => seat("approve", id)} className="font-semibold text-green-700 underline">Aprovar</button>
                  <button onClick={() => setHands((h) => { const x = { ...h }; delete x[id]; return x; })} className="text-slate-600 underline">Recusar</button>
                </div>
              ))}
            </div>
          )}
          {seated.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-sm font-bold">Nas cadeiras</h4>
              {seated.map((p) => (
                <div key={p.identity} className="flex items-center gap-3 text-sm">
                  <span className="flex-1">{p.name}</span>
                  <button onClick={() => seat("mute", p.identity)} className="text-slate-700 underline">Silenciar</button>
                  <button onClick={() => seat("revoke", p.identity)} className="text-red-600 underline">Retirar da cadeira</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Controlos do aluno */}
      {!isHost && (
        <div className="space-y-2 rounded-xl bg-slate-50 p-3">
          {iAmSeated ? (
            <>
              <p className="text-sm font-semibold">🪑 Está numa cadeira. Ligue o que quiser — é opcional e só você controla.</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => toggle("mic")} className={`${btn} ${me?.isMicrophoneEnabled ? "bg-slate-800 text-white" : "bg-white border border-slate-300"}`}>
                  🎤 Microfone {me?.isMicrophoneEnabled ? "ligado" : "desligado"}</button>
                <button onClick={() => toggle("cam")} className={`${btn} ${me?.isCameraEnabled ? "bg-slate-800 text-white" : "bg-white border border-slate-300"}`}>
                  📷 Câmara {me?.isCameraEnabled ? "ligada" : "desligada"}</button>
                <button onClick={() => seat("leave")} className={`${btn} bg-white border border-slate-300 text-red-600`}>Sair da cadeira</button>
              </div>
            </>
          ) : meta.seats === 0 ? (
            <p className="text-sm text-slate-500">Neste momento não há cadeiras abertas. Pode participar no chat e com reações.</p>
          ) : free === 0 ? (
            <p className="text-sm text-slate-500">Todas as cadeiras estão ocupadas.</p>
          ) : meta.modo === "livre" ? (
            <button onClick={() => seat("take")} className={`${btn} bg-brand-terracotta text-white`}>🪑 Sentar numa cadeira livre ({free})</button>
          ) : (
            <button onClick={toggleHand} className={`${btn} ${myHand ? "bg-amber-400 text-slate-900" : "bg-brand-terracotta text-white"}`}>
              {myHand ? "✋ Pedido enviado — tocar para cancelar" : `✋ Pedir cadeira (${free} livre${free > 1 ? "s" : ""})`}
            </button>
          )}
        </div>
      )}

      {err && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{err}</p>}

      {/* Reações e chat privado da turma */}
      <div className="flex flex-wrap gap-2">
        {REACTS.map((k) => <button key={k} onClick={() => react(k)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-lg active:scale-95">{k}</button>)}
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-bold">Chat da turma</h3>
        <div ref={chatBox} className="h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          {chat.length === 0 && <p className="text-slate-400">Ainda sem mensagens.</p>}
          {chat.map((m) => (
            <div key={m.id} className={`rounded-lg p-2 ${m.host ? "border border-amber-300 bg-amber-50" : "bg-white"} ${m.pergunta ? "ring-1 ring-brand-terracotta" : ""}`}>
              <b>{m.nome}</b>
              {m.host && <span className="ml-1 rounded bg-brand-terracotta px-1.5 py-0.5 text-[10px] font-bold text-white">Responsável</span>}
              {m.pergunta && <span className="ml-1 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">✋ Pergunta</span>}
              <p className="break-words">{m.texto}</p>
            </div>
          ))}
        </div>
        <form onSubmit={enviar} className="flex gap-2">
          <input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={300} placeholder="Escreva uma mensagem…"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button disabled={!texto.trim()} className="rounded-lg bg-brand-terracotta px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Enviar</button>
        </form>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={pergunta} onChange={(e) => setPergunta(e.target.checked)} /> ✋ Marcar como pergunta
        </label>
      </div>
      <button onClick={() => room?.disconnect()} className="text-sm text-slate-600 underline">Sair da aula</button>
    </div>
  );
}
