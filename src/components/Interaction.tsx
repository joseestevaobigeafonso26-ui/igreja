"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRole } from "@/lib/auth";

type Msg = {
  id: number; room: string; nome: string; texto: string; tipo: "comentario" | "pergunta";
  autor_tipo: "visitante" | "membro" | "responsavel"; fixado: boolean; respondido: boolean; created_at: string;
};
type Person = { nome: string; tipo: string };

const REACTIONS = [
  { k: "gosto", e: "👍", l: "Gosto" },
  { k: "adoro", e: "❤️", l: "Adoro" },
  { k: "amem", e: "🙏", l: "Amém" },
  { k: "aleluia", e: "🙌", l: "Aleluia" },
  { k: "uau", e: "😮", l: "Uau" },
];

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };

/* ───────── Reações (estilo Facebook) + quem está a assistir ───────── */
function Reactions({ room, clientKey, nome, tipo, showNames }: { room: string; clientKey: string; nome: string; tipo: string; showNames: boolean }) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [parts, setParts] = useState<{ id: number; e: string; x: number }[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const last = useRef(0);
  const pid = useRef(0);

  useEffect(() => {
    if (!clientKey) return;
    supabase.getChannels().filter((c) => c.topic === `realtime:rx:${room}`).forEach((c) => supabase.removeChannel(c));
    const ch = supabase.channel(`rx:${room}`, { config: { broadcast: { self: true }, presence: { key: clientKey } } });
    ch.on("broadcast", { event: "react" }, ({ payload }) => {
      const r = REACTIONS.find((x) => x.k === payload?.k);
      if (!r) return;
      setCounts((c) => ({ ...c, [r.k]: (c[r.k] ?? 0) + 1 }));
      const id = ++pid.current;
      setParts((p) => [...p.slice(-25), { id, e: r.e, x: 8 + Math.random() * 70 }]);
      setTimeout(() => setParts((p) => p.filter((i) => i.id !== id)), 2500);
    });
    ch.on("presence", { event: "sync" }, () => {
      const st = ch.presenceState<Person>();
      setPeople(Object.values(st).map((v) => v[0]).filter(Boolean));
    });
    ch.subscribe((s) => { if (s === "SUBSCRIBED") ch.track({ nome, tipo }); });
    chRef.current = ch;
    return () => { supabase.removeChannel(ch); chRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, clientKey]);

  useEffect(() => { chRef.current?.track({ nome, tipo }); }, [nome, tipo]);

  function react(k: string) {
    const now = Date.now();
    if (now - last.current < 400) return; // evita rajadas de cliques
    last.current = now;
    chRef.current?.send({ type: "broadcast", event: "react", payload: { k } });
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <div className="pointer-events-none absolute bottom-full left-0 right-0 h-0">
          {parts.map((p) => (
            <span key={p.id} className="float-reaction absolute bottom-0 text-3xl" style={{ left: `${p.x}%` }}>{p.e}</span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {REACTIONS.map((r) => (
            <button key={r.k} onClick={() => react(r.k)} title={r.l}
              className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-amber-50 active:scale-95">
              <span className="text-lg">{r.e}</span>
              <span className="text-xs font-semibold text-slate-600">{counts[r.k] ?? 0}</span>
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-500">👥 {people.length} a assistir</span>
        </div>
      </div>
      {showNames && people.length > 0 && (
        <details className="text-xs text-slate-600">
          <summary className="cursor-pointer font-semibold">Participantes ({people.length})</summary>
          <p className="mt-1">{people.map((p) => `${p.nome || "Visitante"}${p.tipo === "membro" ? " (membro)" : ""}`).join(" • ")}</p>
        </details>
      )}
    </div>
  );
}

/* ───────── Comentários e perguntas ───────── */
function Chat({ room, mode, clientKey, nome, setNome, logged, isStaff }:
  { room: string; mode: "simples" | "interativo"; clientKey: string; nome: string; setNome: (n: string) => void; logged: boolean; isStaff: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [pergunta, setPergunta] = useState(false);
  const [soPerguntas, setSoPerguntas] = useState(false);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const interativo = mode === "interativo";

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: s } = await supabase.from("live_sessions").select("started_at").eq("room", room).single();
      let q = supabase.from("live_comments").select("*").eq("room", room).order("id", { ascending: false }).limit(100);
      if (s?.started_at) q = q.gte("created_at", s.started_at);
      const { data } = await q;
      if (active && data) setMsgs((data as Msg[]).reverse());
    })();
    const ch = supabase.channel(`chat:${room}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_comments", filter: `room=eq.${room}` },
        (p) => setMsgs((m) => (m.some((x) => x.id === (p.new as Msg).id) ? m : [...m.slice(-199), p.new as Msg])))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_comments", filter: `room=eq.${room}` },
        (p) => setMsgs((m) => m.map((x) => (x.id === (p.new as Msg).id ? (p.new as Msg) : x))))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "live_comments" },
        (p) => setMsgs((m) => m.filter((x) => x.id !== (p.old as { id: number }).id)))
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [room]);

  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [msgs, soPerguntas]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t) return;
    if (!logged && !nome.trim()) return setErro("Escreva o seu nome para participar.");
    setBusy(true); setErro("");
    const { error } = await supabase.from("live_comments").insert({
      room, nome: (nome.trim() || "Visitante").slice(0, 40), texto: t.slice(0, 300),
      tipo: pergunta ? "pergunta" : "comentario", client_key: clientKey,
    });
    setBusy(false);
    if (error) return setErro(error.message.includes("row-level security") ? "Os comentários só estão abertos durante a transmissão." : error.message);
    setTexto(""); setPergunta(false);
  }

  const upd = (id: number, patch: Partial<Msg>) => supabase.from("live_comments").update(patch).eq("id", id);
  const del = (id: number) => supabase.from("live_comments").delete().eq("id", id);
  const pinned = [...msgs].reverse().find((m) => m.fixado);
  const porResponder = msgs.filter((m) => m.tipo === "pergunta" && !m.respondido).length;
  const lista = soPerguntas ? msgs.filter((m) => m.tipo === "pergunta" && !m.respondido) : msgs;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">{interativo ? "Interação com o responsável" : "Comentários"}</h3>
        {isStaff && interativo && (
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

      <div ref={box} className="h-64 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
        {lista.length === 0 && <p className="text-sm text-slate-400">{soPerguntas ? "Nenhuma pergunta por responder." : "Seja o primeiro a comentar."}</p>}
        {lista.map((m) => (
          <div key={m.id} className={`rounded-lg p-2 text-sm ${m.autor_tipo === "responsavel" ? "border border-amber-300 bg-amber-50" : "bg-white"} ${m.tipo === "pergunta" && !m.respondido ? "ring-1 ring-brand-terracotta" : ""}`}>
            <div className="flex flex-wrap items-center gap-1">
              <span className="font-semibold">{m.nome}</span>
              {m.autor_tipo === "responsavel" && <span className="rounded bg-brand-terracotta px-1.5 py-0.5 text-[10px] font-bold text-white">Responsável</span>}
              {m.autor_tipo === "membro" && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">Membro</span>}
              {m.tipo === "pergunta" && <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">✋ Pergunta{m.respondido ? " · respondida ✓" : ""}</span>}
            </div>
            <p className="break-words">{m.texto}</p>
            {isStaff && (
              <div className="mt-1 flex gap-3 text-xs">
                <button className="text-slate-600 underline" onClick={() => upd(m.id, { fixado: !m.fixado })}>{m.fixado ? "Desafixar" : "Fixar"}</button>
                {m.tipo === "pergunta" && <button className="text-green-700 underline" onClick={() => upd(m.id, { respondido: !m.respondido })}>{m.respondido ? "Reabrir" : "Respondida"}</button>}
                <button className="text-red-600 underline" onClick={() => del(m.id)}>Apagar</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={enviar} className="space-y-2">
        {!logged && (
          <input value={nome} onChange={(e) => { setNome(e.target.value); set("nome", e.target.value); }} maxLength={40}
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

/* ───────── Painel completo ───────── */
export default function Interaction({ room, mode }: { room: string; mode: "simples" | "interativo" }) {
  const { role, isStaff } = useRole();
  const [clientKey, setClientKey] = useState("");
  const [nome, setNome] = useState("");
  const [perfilNome, setPerfilNome] = useState<string | null>(null);

  useEffect(() => {
    let k = get("ck");
    if (!k) { k = crypto.randomUUID(); set("ck", k); }
    setClientKey(k);
    setNome(get("nome") ?? "");
  }, []);

  useEffect(() => {
    if (!role) { setPerfilNome(null); return; }
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("nome").eq("id", user.id).single();
      setPerfilNome(data?.nome ?? null);
    })();
  }, [role]);

  const logged = !!role;
  const display = logged ? perfilNome ?? "Membro" : nome.trim() || "Visitante";
  const tipo = isStaff ? "responsavel" : logged ? "membro" : "visitante";

  return (
    <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
      <Reactions room={room} clientKey={clientKey} nome={display} tipo={tipo} showNames={isStaff && mode === "interativo"} />
      <Chat room={room} mode={mode} clientKey={clientKey} nome={nome} setNome={setNome} logged={logged} isStaff={isStaff} />
    </div>
  );
}
