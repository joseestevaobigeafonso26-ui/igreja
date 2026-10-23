"use client";
import type { Feed } from "@/lib/liveFeed";

/** Camada por cima do vídeo (estilo Facebook Live): reações a subir e últimos comentários. */
export default function FeedOverlay({ feed, lift = false }: { feed: Feed; lift?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className={`absolute right-3 h-full w-20 ${lift ? "bottom-12" : "bottom-3"}`}>
        {feed.parts.map((p) => (
          <span key={p.id} className="float-reaction absolute bottom-0 text-4xl" style={{ right: `${(p.x / 100) * 56}px` }}>{p.e}</span>
        ))}
      </div>
      <div className={`absolute left-3 flex max-w-[70%] flex-col gap-1 ${lift ? "bottom-12" : "bottom-3"}`}>
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
