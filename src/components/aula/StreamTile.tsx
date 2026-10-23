"use client";
import { useEffect, useReducer, useRef } from "react";

/** Um quadrado de vídeo (ou só áudio) com nome. Também reproduz o som do stream, a não ser que `silent`. */
export default function StreamTile({
  stream, nome, big = false, mirror = false, silent = false, mutedByHost = false, micOff = false, status, onBlocked,
}: {
  stream: MediaStream | null;
  nome: string;
  big?: boolean;
  mirror?: boolean; // pré-visualização local (espelhada)
  silent?: boolean; // não reproduzir o áudio (a própria imagem, para não haver eco)
  mutedByHost?: boolean;
  micOff?: boolean;
  status?: string;
  onBlocked?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (!stream) return;
    el.play().catch(() => onBlocked?.());
    const on = () => bump();
    stream.addEventListener("addtrack", on);
    stream.addEventListener("removetrack", on);
    return () => { stream.removeEventListener("addtrack", on); stream.removeEventListener("removetrack", on); };
  }, [stream, onBlocked]);

  const hasVideo = !!stream && stream.getVideoTracks().some((t) => t.readyState === "live");
  return (
    <div className={`relative overflow-hidden rounded-xl bg-slate-900 ${big ? "aspect-video" : "aspect-square"}`}>
      <video ref={ref} autoPlay playsInline muted={silent}
        className={`h-full w-full ${big ? "object-contain" : "object-cover"} ${hasVideo ? "" : "hidden"}`}
        style={mirror ? { transform: "scaleX(-1)" } : undefined} />
      {!hasVideo && (
        <div className="flex h-full flex-col items-center justify-center gap-1">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-700 text-xl font-bold text-white">
            {(nome || "?").trim().slice(0, 1).toUpperCase()}
          </span>
          {status && <span className="text-xs text-slate-400">{status}</span>}
        </div>
      )}
      <div className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
        {mutedByHost ? "🔇 silenciado" : micOff ? "🔇" : "🎤"} {nome}
      </div>
    </div>
  );
}
