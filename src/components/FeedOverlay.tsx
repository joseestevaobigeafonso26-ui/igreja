"use client";
import type { Feed } from "@/lib/liveFeed";

/** Camada por cima do vídeo (estilo Facebook Live): reações a subir e últimos comentários. */
export default function FeedOverlay({ feed }: { feed: Feed }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute bottom-3 right-3 h-full w-20">
        {feed.parts.map((p) => (
          <span key={p.id} className="float-reaction absolute bottom-0 text-4xl" style={{ right: `${(p.x / 100) * 56}px` }}>{p.e}</span>
        ))}
      </div>
      <div className="absolute bottom-3 left-3 flex max-w-[70%] flex-col gap-1">
        {feed.recent.map((m) => (
          <div key={m.id}
            className={`rounded-lg px-3 py-1 text-sm text-white shadow backdrop-blur ${m.tipo === "pergunta" ? "bg-orange-600/80" : "bg-black/60"}`}>
            <b>{m.nome}</b>{m.tipo === "pergunta" ? " ✋" : ""}: {m.texto}
          </div>
        ))}
      </div>
    </div>
  );
}
