"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Entrar() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [ver, setVer] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setBusy(false);
    if (error) return setMsg("Email ou senha incorretos.");
    router.push("/");
    router.refresh();
  }

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2";
  return (
    <form onSubmit={entrar} className="mx-auto max-w-sm space-y-3 rounded-2xl bg-white p-6 shadow-sm">
      <h1 className="text-lg font-bold">Entrar</h1>
      <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
        placeholder="seu@email.com" className={input} />
      <div className="relative">
        <input type={ver ? "text" : "password"} required autoComplete="current-password" value={senha}
          onChange={(e) => setSenha(e.target.value)} placeholder="Senha" className={input} />
        <button type="button" onClick={() => setVer(!ver)} className="absolute right-3 top-2 text-sm text-slate-500">
          {ver ? "Ocultar" : "Mostrar"}
        </button>
      </div>
      <button type="submit" disabled={busy} className="w-full rounded-lg bg-brand-terracotta py-2 font-bold text-white disabled:opacity-50">
        {busy ? "A entrar…" : "Entrar"}
      </button>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      <p className="text-xs text-slate-500">Não existe registo público. O acesso é criado pelo pastor — peça-lhe o seu email e senha.</p>
    </form>
  );
}
