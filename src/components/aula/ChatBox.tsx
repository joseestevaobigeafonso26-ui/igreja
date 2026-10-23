"use client";
import { useEffect, useRef, useState } from "react";
import type { ChatMsg } from "@/lib/aula/protocol";

export default function ChatBox({ chat, onSend }: { chat: ChatMsg[]; onSend: (texto: string, pergunta: boolean) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [texto, setTexto] = useState("");
  const [pergunta, setPergunta] = useState(false);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [chat]);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold">Chat da turma</h3>
      <div ref={box} className="h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
        {chat.length === 0 && <p className="text-slate-400">Ainda sem mensagens.</p>}
        {chat.map((m) => (
          <div key={m.id} className={`rounded-lg p-2 ${m.host ? "border border-amber-300 bg-amber-50" : "bg-white"} ${m.pergunta ? "ring-1 ring-brand-terracotta" : ""}`}>
            <b>{m.nome}</b>
            {m.host && <span className="ml-1 rounded bg-brand-terracotta px-1.5 py-0.5 text-[10px] font-bold text-white">Professor</span>}
            {m.pergunta && <span className="ml-1 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">✋ Pergunta</span>}
            <p className="break-words">{m.texto}</p>
          </div>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); const t = texto.trim(); if (!t) return; onSend(t, pergunta); setTexto(""); setPergunta(false); }} className="flex gap-2">
        <input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={300} placeholder="Escreva uma mensagem…"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <button disabled={!texto.trim()} className="rounded-lg bg-brand-terracotta px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Enviar</button>
      </form>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={pergunta} onChange={(e) => setPergunta(e.target.checked)} /> ✋ Marcar como pergunta
      </label>
    </div>
  );
}
