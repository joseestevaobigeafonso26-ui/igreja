"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type U = { id: string; email: string; nome: string; role: string; ativo: boolean; eu: boolean };
const ROLES = ["membro", "professor", "pastor", "admin"];

async function api(method: string, body?: unknown) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch("/api/admin/users", {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Erro.");
  return json;
}

export default function UsersManager() {
  const [users, setUsers] = useState<U[]>([]);
  const [msg, setMsg] = useState("");
  const [novo, setNovo] = useState({ nome: "", email: "", password: "", role: "membro" });

  const load = useCallback(async () => {
    try { setUsers((await api("GET")).users); } catch (e: any) { setMsg(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); setMsg(ok); await load(); } catch (e: any) { setMsg(e.message); }
  };
  const setRole = (id: string, role: string) => setUsers((us) => us.map((u) => (u.id === id ? { ...u, role } : u)));

  const input = "w-full rounded border border-slate-300 px-2 py-1 text-sm";
  return (
    <div className="space-y-4">
      {msg && <p className="text-sm text-slate-700">{msg}</p>}

      <div className="space-y-2 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
        <h2 className="font-bold">Criar acesso</h2>
        <div className="grid gap-2 sm:grid-cols-4">
          <input className={input} placeholder="Nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
          <input className={input} type="email" placeholder="Email" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} />
          <input className={input} type="text" placeholder="Senha (mín. 8)" value={novo.password} onChange={(e) => setNovo({ ...novo, password: e.target.value })} />
          <select className={input} value={novo.role} onChange={(e) => setNovo({ ...novo, role: e.target.value })}>
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <button
          onClick={() => run(async () => { await api("POST", novo); setNovo({ nome: "", email: "", password: "", role: "membro" }); }, "Acesso criado ✓ — entregue o email e a senha à pessoa.")}
          className="rounded-lg bg-brand-terracotta px-4 py-2 text-sm font-bold text-white">
          Criar acesso
        </button>
        <p className="text-xs text-slate-600">Papéis: <b>membro</b> (envia fotos), <b>professor</b> (transmite e edita conteúdo), <b>pastor/admin</b> (tudo, incluindo acessos).</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Nome</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Papel</th><th /></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{u.nome}{u.eu && " (você)"}{!u.ativo && <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">não ativada</span>}</td>
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">
                  <select disabled={u.eu} value={u.role} onChange={(e) => setRole(u.id, e.target.value)} className="rounded border border-slate-300 px-2 py-1">
                    {ROLES.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </td>
                <td className="space-x-3 whitespace-nowrap px-3 py-2">
                  {!u.eu && !u.ativo && <button className="font-semibold text-blue-700" onClick={() => run(() => api("PATCH", { id: u.id, ativo: true }), "Conta ativada ✓")}>Ativar</button>}
                  {!u.eu && <button className="font-semibold text-green-700" onClick={() => run(() => api("PATCH", { id: u.id, role: u.role }), "Papel guardado ✓")}>Guardar papel</button>}
                  <button className="text-slate-700 underline" onClick={() => {
                    const p = prompt(`Nova senha para ${u.email} (mín. 8 caracteres):`);
                    if (p) run(() => api("PATCH", { id: u.id, password: p }), "Senha alterada ✓");
                  }}>Nova senha</button>
                  {!u.eu && <button className="text-red-600" onClick={() => {
                    if (confirm(`Apagar o acesso de ${u.email}?`)) run(() => api("DELETE", { id: u.id }), "Acesso apagado ✓");
                  }}>Apagar</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
