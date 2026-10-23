"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Sala = { id: number; area: "discipulado" | "teologia"; nome: string; professor_id: string | null; ativa: boolean };
type U = { id: string; email: string; nome: string; role: string; ativo: boolean };

async function usersApi(method: string, body?: unknown) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch("/api/admin/users", {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? "Erro.");
  return j;
}

export default function SalasManager() {
  const [salas, setSalas] = useState<Sala[]>([]);
  const [users, setUsers] = useState<U[]>([]);
  const [membros, setMembros] = useState<string[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [nova, setNova] = useState({ area: "discipulado", nome: "", professor_id: "" });
  const [add, setAdd] = useState("");
  const [aluno, setAluno] = useState({ nome: "", email: "", password: "" });

  const loadSalas = useCallback(async () => {
    const { data, error } = await supabase.from("salas").select("*").order("area").order("nome");
    if (error) setMsg("Execute o schema_v10.sql no Supabase. (" + error.message + ")"); else setSalas((data ?? []) as Sala[]);
  }, []);
  const loadUsers = useCallback(async () => {
    try { setUsers((await usersApi("GET")).users); } catch (e: any) { setMsg(e.message); }
  }, []);
  const loadMembros = useCallback(async (id: number) => {
    const { data } = await supabase.from("sala_membros").select("user_id").eq("sala_id", id);
    setMembros((data ?? []).map((m) => m.user_id as string));
  }, []);

  useEffect(() => { loadSalas(); loadUsers(); }, [loadSalas, loadUsers]);
  useEffect(() => { if (sel) loadMembros(sel); else setMembros([]); }, [sel, loadMembros]);

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null } | void>, ok: string) => {
    const r: any = await fn();
    setMsg(r?.error ? r.error.message : ok);
  };

  const sala = salas.find((s) => s.id === sel);
  const staff = users.filter((u) => ["professor", "pastor", "admin"].includes(u.role));
  const nomeDe = (id: string) => { const u = users.find((x) => x.id === id); return u ? `${u.nome || u.email} (${u.email})` : id; };
  const input = "w-full rounded border border-slate-300 px-2 py-1 text-sm";

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-slate-500">
        Cada sala tem o seu professor e os seus alunos. Só quem está inscrito consegue entrar na aula ao vivo, com o email e a senha que você criar.
      </p>
      {msg && <p className="text-sm text-slate-700">{msg}</p>}

      <div className="space-y-2 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
        <h2 className="font-bold">Nova sala</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <select className={input} value={nova.area} onChange={(e) => setNova({ ...nova, area: e.target.value })}>
            <option value="discipulado">Discipulado</option><option value="teologia">Teologia</option>
          </select>
          <input className={input} placeholder="Nome (ex.: Turma A — Domingo)" value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} />
          <select className={input} value={nova.professor_id} onChange={(e) => setNova({ ...nova, professor_id: e.target.value })}>
            <option value="">Professor (opcional)</option>
            {staff.map((u) => <option key={u.id} value={u.id}>{u.nome || u.email}</option>)}
          </select>
        </div>
        <button className="rounded-lg bg-brand-terracotta px-4 py-2 text-sm font-bold text-white"
          onClick={() => run(async () => {
            const r = await supabase.from("salas").insert({ area: nova.area, nome: nova.nome.trim(), professor_id: nova.professor_id || null });
            if (!r.error) { setNova({ ...nova, nome: "" }); loadSalas(); }
            return r;
          }, "Sala criada ✓")}>Criar sala</button>
        <p className="text-xs text-slate-600">O pastor e o admin dirigem qualquer sala; um professor só a sala em que foi indicado.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {salas.map((s) => (
          <button key={s.id} onClick={() => setSel(s.id)}
            className={`rounded-lg px-3 py-2 text-sm ${sel === s.id ? "bg-brand-terracotta font-semibold text-white" : "border border-slate-300 bg-white"} ${s.ativa ? "" : "opacity-50"}`}>
            {s.area === "teologia" ? "📖" : "🌱"} {s.nome}
          </button>
        ))}
        {salas.length === 0 && <p className="text-sm text-slate-500">Ainda não há salas.</p>}
      </div>

      {sala && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-bold">{sala.nome}</h3>
            <select className="rounded border border-slate-300 px-2 py-1 text-sm" value={sala.professor_id ?? ""}
              onChange={(e) => run(async () => { const r = await supabase.from("salas").update({ professor_id: e.target.value || null }).eq("id", sala.id); loadSalas(); return r; }, "Professor atualizado ✓")}>
              <option value="">Sem professor</option>
              {staff.map((u) => <option key={u.id} value={u.id}>{u.nome || u.email}</option>)}
            </select>
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={sala.ativa}
                onChange={(e) => run(async () => { const r = await supabase.from("salas").update({ ativa: e.target.checked }).eq("id", sala.id); loadSalas(); return r; }, "Estado atualizado ✓")} /> Ativa
            </label>
            <button className="ml-auto text-sm text-red-600 underline"
              onClick={() => { if (confirm(`Apagar a sala "${sala.nome}"?`)) run(async () => { const r = await supabase.from("salas").delete().eq("id", sala.id); setSel(null); loadSalas(); return r; }, "Sala apagada ✓"); }}>Apagar sala</button>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-bold">Alunos ({membros.length})</h4>
            {membros.length === 0 && <p className="text-sm text-slate-500">Ninguém inscrito ainda.</p>}
            {membros.map((id) => (
              <div key={id} className="flex items-center gap-3 text-sm">
                <span className="flex-1">{nomeDe(id)}</span>
                <button className="text-red-600 underline"
                  onClick={() => run(async () => { const r = await supabase.from("sala_membros").delete().eq("sala_id", sala.id).eq("user_id", id); loadMembros(sala.id); return r; }, "Aluno removido ✓")}>Remover</button>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-bold">Adicionar quem já tem acesso</h4>
            <div className="flex gap-2">
              <select className={input} value={add} onChange={(e) => setAdd(e.target.value)}>
                <option value="">Escolher…</option>
                {users.filter((u) => !membros.includes(u.id)).map((u) => <option key={u.id} value={u.id}>{u.nome || u.email} — {u.email}</option>)}
              </select>
              <button disabled={!add} className="rounded-lg bg-brand-terracotta px-3 py-1 text-sm font-bold text-white disabled:opacity-40"
                onClick={() => run(async () => { const r = await supabase.from("sala_membros").insert({ sala_id: sala.id, user_id: add }); setAdd(""); loadMembros(sala.id); return r; }, "Aluno adicionado ✓")}>Adicionar</button>
            </div>
          </div>

          <div className="space-y-2 rounded-lg bg-slate-50 p-3">
            <h4 className="text-sm font-bold">Criar acesso novo e inscrever já nesta sala</h4>
            <div className="grid gap-2 sm:grid-cols-3">
              <input className={input} placeholder="Nome" value={aluno.nome} onChange={(e) => setAluno({ ...aluno, nome: e.target.value })} />
              <input className={input} type="email" placeholder="Email" value={aluno.email} onChange={(e) => setAluno({ ...aluno, email: e.target.value })} />
              <input className={input} placeholder="Senha (mín. 8)" value={aluno.password} onChange={(e) => setAluno({ ...aluno, password: e.target.value })} />
            </div>
            <button className="rounded-lg bg-brand-terracotta px-4 py-2 text-sm font-bold text-white"
              onClick={async () => {
                try {
                  const r = await usersApi("POST", { ...aluno, role: "membro" });
                  const ins = await supabase.from("sala_membros").insert({ sala_id: sala.id, user_id: r.id });
                  if (ins.error) throw new Error(ins.error.message);
                  setAluno({ nome: "", email: "", password: "" });
                  setMsg("Aluno criado e inscrito ✓ — entregue-lhe o email e a senha.");
                  loadUsers(); loadMembros(sala.id);
                } catch (e: any) { setMsg(e.message); }
              }}>Criar e inscrever</button>
          </div>
        </div>
      )}
    </div>
  );
}
