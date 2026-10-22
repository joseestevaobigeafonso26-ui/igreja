"use client";
import { useEffect, useRef, useState } from "react";
import { REACTIONS, type Feed, type Identity } from "@/lib/liveFeed";

function Reactions({ feed, showNames }: { feed: Feed; showNames: boolean }) {
  return (
    <div className="space-y-2">
      <div className="relative">
        <div className="pointer-events-none absolute bottom-full left-0 right-0 h-0">
          {feed.parts.map((p) => (
            <span key={p.id} className="float-reaction absolute bottom-0 text-3xl" style={{ left: `${p.x}%` }}>{p.e}</span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {REACTIONS.map((r) => (
            <button key={r.k} onClick={() => feed.react(r.k)} title={r.l}
              className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-amber-50 active:scale-95">
              <span className="text-lg">{r.e}</span>
              <span className="text-xs font-semibold text-slate-600">{feed.counts[r.k] ?? 0}</span>
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-500">👥 {feed.people.length} a assistir</span>
        </div>
      </div>
      {showNames && feed.people.length > 0 && (
        <details className="text-xs text-slate-600">
          <summary className="cursor-pointer font-semibold">Participantes ({feed.people.length})</summary>
          <p className="mt-1">{feed.people.map((p) => `${p.nome || "Visitante"}${p.tipo === "membro" ? " (membro)" : ""}`).join(" • ")}</p>
        </details>
      )}
    </div>
  );
}

function Chat({ feed, id, mode, tall }: { feed: Feed; id: Identity; mode: "simples" | "interativo"; tall: boolean }) {
  const [texto, setTexto] = useState("");
  const [pergunta, setPergunta] = useState(false);
  const [soPerguntas, setSoPerguntas] = useState(false);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const interativo = mode === "interativo";
  const { msgs } = feed;

  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [msgs, soPerguntas]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    if (!id.logged && !id.nome.trim()) return setErro("Escreva o seu nome para participar.");
    setBusy(true); setErro("");
    const err = await feed.send(texto, id.logged ? id.display : id.nome, pergunta);
    setBusy(false);
    if (err) return setErro(err);
    setTexto(""); setPergunta(false);
  }

  const pinned = [...msgs].reverse().find((m) => m.fixado);
  const porResponder = msgs.filter((m) => m.tipo === "pergunta" && !m.respondido).length;
  const lista = soPerguntas ? msgs.filter((m) => m.tipo === "pergunta" && !m.respondido) : msgs;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">{interativo ? "Interação com o responsável" : "Comentários"}</h3>
        {id.isStaff && interativo && (
          <button onClick={() => setSoPerguntas(!soPerguntas)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${soPerguntas ? "bg-brand-terracotta text-white" : "bg-amber-100 text-amber-800"}`}>
            ✋ Por responder: {porResponder}
          </button>
        )}
      </div>

      {pinned && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm">
          <span className="mr-1 text-xs font-bold text-amber-700">📌 Fixado</span>{pinned.texto}
        </div>
      )}

      <div ref={box} className={`${tall ? "h-[55vh]" : "h-64"} space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3`}>
        {lista.length === 0 && <p className="text-sm text-slate-400">{soPerguntas ? "Nenhuma pergunta por responder." : "Seja o primeiro a comentar."}</p>}
        {lista.map((m) => (
          <div key={m.id} className={`rounded-lg p-2 ${tall ? "text-base" : "text-sm"} ${m.autor_tipo === "responsavel" ? "border border-amber-300 bg-amber-50" : "bg-white"} ${m.tipo === "pergunta" && !m.respondido ? "ring-1 ring-brand-terracotta" : ""}`}>
            <div className="flex flex-wrap items-center gap-1">
              <span className="font-semibold">{m.nome}</span>
              {m.autor_tipo === "responsavel" && <span className="rounded bg-brand-terracotta px-1.5 py-0.5 text-[10px] font-bold text-white">Responsável</span>}
              {m.autor_tipo === "membro" && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">Membro</span>}
              {m.tipo === "pergunta" && <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">✋ Pergunta{m.respondido ? " · respondida ✓" : ""}</span>}
            </div>
            <p className="break-words">{m.texto}</p>
            {id.isStaff && (
              <div className="mt-1 flex gap-3 text-xs">
                <button className="text-slate-600 underline" onClick={() => feed.upd(m.id, { fixado: !m.fixado })}>{m.fixado ? "Desafixar" : "Fixar"}</button>
                {m.tipo === "pergunta" && <button className="text-green-700 underline" onClick={() => feed.upd(m.id, { respondido: !m.respondido })}>{m.respondido ? "Reabrir" : "Respondida"}</button>}
                <button className="text-red-600 underline" onClick={() => feed.del(m.id)}>Apagar</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={enviar} className="space-y-2">
        {!id.logged && (
          <input value={id.nome} onChange={(e) => id.setNome(e.target.value)} maxLength={40}
            placeholder="O seu nome" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        )}
        <div className="flex gap-2">
          <input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={300}
            placeholder={pergunta ? "Escreva a sua pergunta…" : "Escreva um comentário…"}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button disabled={busy || !texto.trim()} className="rounded-lg bg-brand-terracotta px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Enviar</button>
        </div>
        {interativo && (
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={pergunta} onChange={(e) => setPergunta(e.target.checked)} />
            ✋ Marcar como pergunta ao responsável
          </label>
        )}
        {erro && <p className="text-xs text-red-600">{erro}</p>}
      </form>
    </div>
  );
}

export default function Interaction({ mode, feed, id, tall = false }: { mode: "simples" | "interativo"; feed: Feed; id: Identity; tall?: boolean }) {
  return (
    <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
      <Reactions feed={feed} showNames={id.isStaff && mode === "interativo"} />
      <Chat feed={feed} id={id} mode={mode} tall={tall} />
    </div>
  );
}
