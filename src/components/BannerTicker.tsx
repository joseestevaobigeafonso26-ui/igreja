"use client";

/** Rodapé de informações a deslizar, estilo telejornal. Linhas do texto são unidas por " • ". */
export default function BannerTicker({ texto, lift = 0 }: { texto: string; lift?: number }) {
  if (!texto) return null;
  const linha = texto.split("\n").map((l) => l.trim()).filter(Boolean).join("   •   ");
  const dur = Math.max(18, linha.length * 0.22); // segundos: mais texto, mais devagar
  return (
    <div className="pointer-events-none absolute left-0 right-0 flex h-8 items-stretch overflow-hidden shadow-lg" style={{ bottom: lift }}>
      <div className="flex shrink-0 items-center bg-brand-terracotta px-3 text-xs font-extrabold uppercase tracking-wider text-white">Informação</div>
      <div className="relative flex-1 overflow-hidden bg-slate-900/90">
        <span className="ticker-text absolute inset-y-0 flex items-center pl-4 text-sm font-medium text-white" style={{ animationDuration: `${dur}s` }}>
          {linha}
        </span>
      </div>
    </div>
  );
}
