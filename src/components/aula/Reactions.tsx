"use client";
import { useCallback, useRef, useState } from "react";
import { REACTS } from "@/lib/aula/protocol";

/** Emojis que sobem no ecrã quando alguém reage. */
export function useReactions() {
  const [parts, setParts] = useState<{ id: number; e: string; x: number }[]>([]);
  const n = useRef(0);
  const add = useCallback((e: string) => {
    const id = ++n.current;
    setParts((p) => [...p.slice(-25), { id, e, x: 8 + Math.random() * 80 }]);
    setTimeout(() => setParts((p) => p.filter((i) => i.id !== id)), 2500);
  }, []);
  return { parts, add };
}

export function ReactionLayer({ parts }: { parts: { id: number; e: string; x: number }[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {parts.map((p) => <span key={p.id} className="float-reaction absolute bottom-2 text-4xl" style={{ left: `${p.x}%` }}>{p.e}</span>)}
    </div>
  );
}

export function ReactionBar({ onReact }: { onReact: (k: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {REACTS.map((k) => <button key={k} onClick={() => onReact(k)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-lg active:scale-95">{k}</button>)}
    </div>
  );
}
