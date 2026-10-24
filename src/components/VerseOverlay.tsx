"use client";
import type { Verso } from "@/lib/rtc";

/** Cartão com o texto bíblico por cima do vídeo. `lift` deixa espaço em baixo para o banner/controlos. */
export default function VerseOverlay({ verso, lift = 0 }: { verso: Verso; lift?: number }) {
  if (!verso) return null;
  const n = verso.texto.length;
  const tam = n <= 140 ? "text-lg sm:text-2xl" : n <= 320 ? "text-sm sm:text-xl" : "text-xs sm:text-base";
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center p-3" style={{ bottom: lift }}>
      <div className="max-h-full w-full max-w-3xl overflow-hidden rounded-2xl border border-amber-400/60 bg-black/75 px-5 py-4 text-center text-white shadow-2xl backdrop-blur">
        <p className="mb-1 text-xs font-extrabold uppercase tracking-widest text-amber-300">📖 {verso.ref}</p>
        <p className={`${tam} font-serif leading-snug`}>{verso.texto}</p>
      </div>
    </div>
  );
}
