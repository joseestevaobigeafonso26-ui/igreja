"use client";
import { useEffect, useRef, useState } from "react";
import { useBroadcaster, useIsLive, useViewer, type Source } from "@/lib/rtc";
import { useRole } from "@/lib/auth";
import Interaction from "@/components/Interaction";
import FeedOverlay from "@/components/FeedOverlay";
import { useIdentity, useLiveFeed, type Feed } from "@/lib/liveFeed";

export function Video({ stream, muted }: { stream: MediaStream | null; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} controls={!muted} className="h-full w-full object-contain" />;
}

function Viewer({ room }: { room: string }) {
  const { stream, error, status } = useViewer(room);
  const live = useIsLive(room);
  return (
    <div className="aspect-video overflow-hidden rounded-xl bg-black">
      {stream ? (
        <Video stream={stream} />
      ) : (
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-400">
          {error ?? (live ? status : "Sem transmissão neste momento. Quando começar, o vídeo aparece aqui automaticamente.")}
        </div>
      )}
    </div>
  );
}

function Broadcaster({ room, feed }: { room: string; feed: Feed }) {
  const { stream, viewers, error, start, stop } = useBroadcaster(room);
  const [source, setSource] = useState<Source>("tela");
  return (
    <div className="space-y-3">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
        {stream ? <Video stream={stream} muted /> : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-400">
            Escolha a fonte e clique em iniciar. A sua pré-visualização aparece aqui.
          </div>
        )}
        {stream && <FeedOverlay feed={feed} />}
      </div>
      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {!stream ? (
          <>
            <select value={source} onChange={(e) => setSource(e.target.value as Source)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="tela">Partilhar ecrã (computador)</option>
              <option value="camera">Câmara + microfone (telemóvel/altar)</option>
            </select>
            <button onClick={() => start(source)}
              className="rounded-lg bg-brand-terracotta px-4 py-2 text-sm font-bold text-white hover:bg-brand-terracotta-dark">
              Iniciar transmissão
            </button>
          </>
        ) : (
          <>
            <button onClick={stop} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white">
              Terminar transmissão
            </button>
            <span className="text-sm text-slate-600">{viewers} espectador(es) ligado(s)</span>
            <button onClick={() => window.open(`/painel/${room}`, "painel-" + room, "width=480,height=820")}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
              Abrir painel de comentários (outra janela/ecrã)
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function LiveRoom({ room, title, mode = "simples" }: { room: string; title: string; mode?: "simples" | "interativo" }) {
  const { isStaff, loading } = useRole();
  const live = useIsLive(room);
  const id = useIdentity();
  const feed = useLiveFeed(room, live && !loading, id);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold text-slate-800">{title}</h2>
        {live && (
          <span className="badge-live rounded-full bg-brand-terracotta px-3 py-1 text-xs font-bold text-white">● AO VIVO</span>
        )}
      </div>
      {loading ? null : isStaff ? <Broadcaster room={room} feed={feed} /> : <Viewer room={room} />}
      {live && !loading && <Interaction mode={mode} feed={feed} id={id} />}
    </section>
  );
}
