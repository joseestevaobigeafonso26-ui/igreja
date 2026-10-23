"use client";
import { useEffect, useState } from "react";
import { useBroadcaster, useViewer } from "@/lib/rtc";
import { Video } from "@/components/LiveRoom";

const ROOMS = [
  { id: "culto", label: "Culto ao vivo" },
  { id: "agenda", label: "Agenda / informações" },
];

/** Telemóvel: envia a câmara para o computador (sala privada "cam-<sala>", só equipa). */
function CameraSender({ room }: { room: string }) {
  const { stream, viewers, error, start, stop } = useBroadcaster(`cam-${room}`);

  // Mantém o ecrã do telemóvel ligado enquanto filma.
  useEffect(() => {
    if (!stream) return;
    let lock: any;
    (navigator as any).wakeLock?.request("screen").then((l: any) => (lock = l)).catch(() => {});
    return () => { lock?.release?.().catch?.(() => {}); };
  }, [stream]);

  return (
    <div className="space-y-3">
      <div className="aspect-video overflow-hidden rounded-xl bg-black">
        {stream ? <Video stream={stream} muted /> : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-400">
            Toque em “Começar a filmar”. O computador passa a ver esta imagem.
          </div>
        )}
      </div>
      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {!stream ? (
        <button onClick={() => start("camera")} className="rounded-lg bg-brand-terracotta px-4 py-2 text-sm font-bold text-white">
          Começar a filmar
        </button>
      ) : (
        <div className="flex items-center gap-3">
          <button onClick={stop} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white">Parar câmara</button>
          <span className="text-sm text-slate-600">{viewers ? "Computador ligado ✓" : "A aguardar o computador…"}</span>
        </div>
      )}
      <p className="text-xs text-slate-500">Deixe esta página aberta. O ecrã do telemóvel fica ligado enquanto filma.</p>
    </div>
  );
}

/** Computador: vê a câmara do telemóvel e decide quando transmitir ao vivo. */
function Monitor({ room }: { room: string }) {
  const { stream, error, status } = useViewer(`cam-${room}`);
  const live = useBroadcaster(room);
  return (
    <div className="space-y-3">
      <div className="aspect-video overflow-hidden rounded-xl bg-black">
        {stream ? <Video stream={stream} muted /> : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-400">
            {error ?? `Sem imagem do telemóvel. ${status} — no telemóvel, escolha “Este aparelho é a câmara” na mesma sala.`}
          </div>
        )}
      </div>
      {live.error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{live.error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        {!live.stream ? (
          <button disabled={!stream} onClick={() => stream && live.start(stream)}
            className="rounded-lg bg-brand-terracotta px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
            Transmitir ao vivo para os espectadores
          </button>
        ) : (
          <>
            <button onClick={live.stop} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white">Terminar transmissão</button>
            <span className="badge-live rounded-full bg-brand-terracotta px-3 py-1 text-xs font-bold text-white">● AO VIVO</span>
            <span className="text-sm text-slate-600">{live.viewers} espectador(es)</span>
          </>
        )}
      </div>
      <p className="text-xs text-slate-500">
        O computador recebe a imagem do telemóvel e reenvia-a aos espectadores — precisa de boa ligação de envio (upload).
        Se o telemóvel parar e voltar, termine e inicie a transmissão de novo.
      </p>
    </div>
  );
}

export default function RemoteCamera() {
  const [room, setRoom] = useState("culto");
  const [mode, setMode] = useState<"camera" | "monitor" | null>(null);
  const btn = (active: boolean) =>
    `rounded-lg px-4 py-2 text-sm ${active ? "bg-brand-terracotta font-semibold text-white" : "bg-white border border-slate-300"}`;
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-lg font-bold">Câmara remota</h2>
        <p className="text-sm text-slate-500">
          O telemóvel filma e o computador mostra e transmite essa imagem. Abra esta página nos dois aparelhos, com a conta da equipa,
          escolha a <b>mesma sala</b> e depois o papel de cada um.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {ROOMS.map((r) => (
          <button key={r.id} onClick={() => { setRoom(r.id); setMode(null); }} className={btn(room === r.id)}>{r.label}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setMode("camera")} className={btn(mode === "camera")}>📱 Este aparelho é a câmara</button>
        <button onClick={() => setMode("monitor")} className={btn(mode === "monitor")}>🖥️ Este aparelho é o monitor</button>
      </div>
      {mode === "camera" && <CameraSender key={room} room={room} />}
      {mode === "monitor" && <Monitor key={room} room={room} />}
    </div>
  );
}
