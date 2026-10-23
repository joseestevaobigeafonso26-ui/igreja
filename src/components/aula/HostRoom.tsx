"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { HostEngine } from "@/lib/aula/HostEngine";
import { aulaApi } from "@/lib/aula/api";
import { AUDIO_CONSTRAINTS, MAX_ALUNOS, MAX_SEATS, Modo, Person } from "@/lib/aula/protocol";
import { openHostTransport } from "@/lib/aula/supabaseTransport";
import { rtcConfig } from "@/lib/rtc";
import ChatBox from "./ChatBox";
import { ReactionBar, ReactionLayer, useReactions } from "./Reactions";
import StreamTile from "./StreamTile";

const btn = "rounded-lg px-3 py-2 text-sm font-semibold";
const on = "bg-slate-800 text-white";
const off = "bg-white border border-slate-300";

/** Lado do professor: o navegador dele é a ponte. Recebe os alunos que têm a palavra e reenvia à turma. */
export default function HostRoom({ salaId, nome, hostNome, roster, onExit }: {
  salaId: number; nome: string; hostNome: string; roster: Person[]; onExit: () => void;
}) {
  const eng = useRef<HostEngine | null>(null);
  const camTrack = useRef<MediaStreamTrack | null>(null);
  const screenTrack = useRef<MediaStreamTrack | null>(null);
  const [phase, setPhase] = useState<"idle" | "starting" | "live">("idle");
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);
  const react = useReactions();
  const [err, setErr] = useState("");
  const [warn, setWarn] = useState("");
  const [seatsIn, setSeatsIn] = useState(1);
  const [modoIn, setModoIn] = useState<Modo>("aprovar");
  const [uplink, setUplink] = useState(5000);
  const [screenOn, setScreenOn] = useState(false);

  const teardown = useCallback(() => {
    eng.current?.end();
    eng.current = null;
    camTrack.current?.stop(); camTrack.current = null;
    screenTrack.current?.stop(); screenTrack.current = null;
    setScreenOn(false);
  }, []);
  useEffect(() => () => teardown(), [teardown]);

  // Aviso ao fechar o separador com a aula a decorrer
  useEffect(() => {
    if (phase !== "live") return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [phase]);

  // Alunos inscritos depois de a aula começar passam a ser ouvidos
  useEffect(() => {
    if (phase !== "live") return;
    const id = setInterval(async () => {
      try {
        const j = await aulaApi<{ roster: Person[] }>("/api/aula/acesso", { sala_id: salaId });
        j.roster.forEach((p) => eng.current?.addMember(p));
      } catch {}
    }, 90_000);
    return () => clearInterval(id);
  }, [phase, salaId]);

  async function start() {
    setPhase("starting"); setErr(""); setWarn("");
    let media: MediaStream | null = null;
    try {
      try {
        media = await navigator.mediaDevices.getUserMedia({
          audio: AUDIO_CONSTRAINTS, video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        });
      } catch (e: any) {
        if (e?.name === "NotAllowedError") throw e;
        media = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
        setWarn("Não encontrei câmara: a aula começa só com áudio. Pode partilhar o ecrã.");
      }
      const [rtc, transport] = await Promise.all([rtcConfig(), openHostTransport(salaId, roster, setWarn)]);
      const e = new HostEngine({
        transport, rtc, hostNome, roster, uplinkKbps: uplink, onChange: bump,
        onReact: (k) => react.add(k),
      });
      e.setSeats(seatsIn, modoIn);
      camTrack.current = media.getVideoTracks()[0] ?? null;
      e.start(media);
      eng.current = e;
      setPhase("live");
    } catch (e: any) {
      media?.getTracks().forEach((t) => t.stop());
      setPhase("idle");
      setErr(e?.name === "NotAllowedError" ? "Permissão negada. Autorize o microfone e a câmara no navegador." : e?.message ?? "Não foi possível iniciar a aula.");
    }
  }

  function stopScreen() {
    screenTrack.current?.stop(); screenTrack.current = null;
    eng.current?.setVideo(camTrack.current);
    setScreenOn(false);
  }
  async function toggleScreen() {
    setErr("");
    if (screenTrack.current) return stopScreen();
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Este aparelho não suporta partilha de ecrã.");
      const ds = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
      const t = ds.getVideoTracks()[0];
      screenTrack.current = t;
      t.onended = () => stopScreen();
      eng.current?.setVideo(t, { screen: true });
      setScreenOn(true);
    } catch (e: any) { if (e?.name !== "NotAllowedError") setErr(e.message ?? "Não foi possível partilhar o ecrã."); }
  }
  function toggleCam() { const t = camTrack.current; if (t) { t.enabled = !t.enabled; bump(); } }
  function toggleMic() { eng.current?.hostStream?.getAudioTracks().forEach((t) => (t.enabled = !t.enabled)); bump(); }

  function encerrar() {
    if (!confirm("Encerrar a aula para todos?")) return;
    teardown();
    setPhase("idle");
  }

  const e = eng.current;
  if (phase !== "live" || !e) {
    return (
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h2 className="text-lg font-bold">{nome}</h2>
        <p className="text-sm text-slate-600">
          Você dirige esta aula. O vídeo passa por <b>este computador</b>: durante a aula, mantenha este separador aberto e visível,
          com boa internet e fones (evita eco).
        </p>
        <button onClick={start} disabled={phase === "starting"} className="rounded-lg bg-brand-terracotta px-6 py-3 font-bold text-white disabled:opacity-50">
          {phase === "starting" ? "A iniciar…" : "Iniciar a aula"}
        </button>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button onClick={onExit} className="block w-full text-sm text-slate-500 underline">Voltar</button>
      </div>
    );
  }

  const seated = e.seatedList();
  const hands = e.handsList();
  const conn = e.connected();
  const free = Math.max(0, e.seats - seated.length);
  const micOn = !!e.hostStream?.getAudioTracks().some((t) => t.enabled);
  const camOn = !!camTrack.current?.enabled;

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">{nome}</h2>
        <span className="badge-live rounded-full bg-brand-terracotta px-3 py-1 text-xs font-bold text-white">● AO VIVO · {conn.length}/{MAX_ALUNOS} alunos</span>
      </div>
      <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
        A aula passa por este computador: não feche nem minimize este separador. Use fones para não haver eco.
      </p>
      {warn && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{warn}</p>}

      <div className="relative">
        <ReactionLayer parts={react.parts} />
        <StreamTile stream={e.hostStream} nome={`${hostNome} (você)`} big silent mirror={!screenOn} micOff={!micOn} />
      </div>

      {(e.seats > 0 || seated.length > 0) && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold">🪑 Cadeiras ({seated.length}/{e.seats})</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {seated.map((p) => (
              <StreamTile key={p.uid} stream={e.seatStream(p.uid)} nome={p.nome} mutedByHost={e.muted.has(p.uid)} status="a ligar…" />
            ))}
            {Array.from({ length: free }).map((_, i) => (
              <div key={i} className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-xs text-slate-400">🪑 livre</div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3 rounded-xl bg-slate-50 p-3">
        <div className="flex flex-wrap gap-2">
          <button onClick={toggleCam} disabled={!camTrack.current || screenOn} className={`${btn} ${camOn && !screenOn ? on : off} disabled:opacity-40`}>
            📷 Câmara {camOn && !screenOn ? "ligada" : "desligada"}</button>
          <button onClick={toggleMic} className={`${btn} ${micOn ? on : off}`}>🎤 Microfone {micOn ? "ligado" : "desligado"}</button>
          <button onClick={toggleScreen} className={`${btn} ${screenOn ? on : off}`}>🖥️ {screenOn ? "Parar partilha de ecrã" : "Partilhar ecrã"}</button>
          <button onClick={encerrar} className={`${btn} ml-auto bg-red-600 text-white`}>Encerrar aula</button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">Cadeiras:</span>
          <select value={seatsIn} onChange={(ev) => setSeatsIn(Number(ev.target.value))} className="rounded border border-slate-300 px-2 py-1">
            {Array.from({ length: MAX_SEATS + 1 }, (_, n) => n).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <select value={modoIn} onChange={(ev) => setModoIn(ev.target.value as Modo)} className="rounded border border-slate-300 px-2 py-1">
            <option value="aprovar">Eu aprovo cada pedido</option>
            <option value="livre">Livre (o primeiro a sentar fica)</option>
          </select>
          <button onClick={() => e.setSeats(seatsIn, modoIn)} className={`${btn} bg-brand-terracotta text-white`}>Guardar</button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">Qualidade do vídeo:</span>
          <select value={uplink} onChange={(ev) => { const v = Number(ev.target.value); setUplink(v); e.setUplinkKbps(v); }} className="rounded border border-slate-300 px-2 py-1">
            <option value={2500}>Internet fraca (2 Mbps de envio)</option>
            <option value={5000}>Normal (5 Mbps de envio)</option>
            <option value={10000}>Internet muito boa (10 Mbps)</option>
          </select>
        </div>

        {hands.length > 0 && (
          <div className="space-y-1">
            <h4 className="text-sm font-bold">✋ Pedidos da palavra</h4>
            {hands.map((p) => (
              <div key={p.uid} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{p.nome}</span>
                <button onClick={() => { const m = e.approve(p.uid); setErr(m ?? ""); }} className="font-semibold text-green-700 underline">Dar a palavra</button>
                <button onClick={() => e.decline(p.uid)} className="text-slate-600 underline">Recusar</button>
              </div>
            ))}
          </div>
        )}
        {seated.length > 0 && (
          <div className="space-y-1">
            <h4 className="text-sm font-bold">Com a palavra</h4>
            {seated.map((p) => (
              <div key={p.uid} className="flex items-center gap-3 text-sm">
                <span className="flex-1">{p.nome}</span>
                <button onClick={() => e.mute(p.uid, !e.muted.has(p.uid))} className="text-slate-700 underline">{e.muted.has(p.uid) ? "Reativar som" : "Silenciar"}</button>
                <button onClick={() => e.revoke(p.uid)} className="text-red-600 underline">Retirar</button>
              </div>
            ))}
          </div>
        )}
        {conn.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold">Alunos ligados ({conn.length})</summary>
            <div className="mt-1 space-y-1">
              {conn.map((p) => (
                <div key={p.uid} className="flex items-center gap-3">
                  <span className="flex-1">{p.nome}</span>
                  <button onClick={() => { if (confirm(`Remover ${p.nome} da aula?`)) e.kick(p.uid); }} className="text-red-600 underline">Remover</button>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {err && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{err}</p>}

      <ReactionBar onReact={(k) => { e.react(k); react.add(k); }} />
      <ChatBox chat={[...e.chat]} onSend={(t, q) => e.sendChat(t, q)} />
    </div>
  );
}
