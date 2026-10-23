"use client";
import { useState } from "react";
import HostRoom from "@/components/aula/HostRoom";
import StudentRoom from "@/components/aula/StudentRoom";
import { aulaApi } from "@/lib/aula/api";
import type { Person } from "@/lib/aula/protocol";

type Acesso = { uid: string; nome: string; host: boolean; roster: Person[] };

/**
 * Entrada da aula. Sem servidor de vídeo: o computador do professor faz de ponte.
 * Aqui só se confirma, no servidor, quem a pessoa é nesta sala (professor ou aluno inscrito).
 */
export default function AulaRoom({ salaId, nome }: { salaId: number; nome: string }) {
  const [acesso, setAcesso] = useState<Acesso | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function entrar() {
    setBusy(true); setErr("");
    try { setAcesso(await aulaApi<Acesso>("/api/aula/acesso", { sala_id: salaId })); }
    catch (e: any) { setErr(e.message ?? "Não foi possível entrar na aula."); }
    setBusy(false);
  }

  if (acesso) {
    const sair = () => setAcesso(null);
    return acesso.host
      ? <HostRoom salaId={salaId} nome={nome} hostNome={acesso.nome} roster={acesso.roster} onExit={sair} />
      : <StudentRoom salaId={salaId} nome={nome} uid={acesso.uid} onExit={sair} />;
  }
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <h2 className="text-lg font-bold">{nome}</h2>
      <p className="text-sm text-slate-500">Ao entrar, os seus dados de acesso são verificados. Use fones para evitar eco.</p>
      <button onClick={entrar} disabled={busy} className="rounded-lg bg-brand-terracotta px-6 py-3 font-bold text-white disabled:opacity-50">
        {busy ? "A entrar…" : "Entrar na aula"}
      </button>
      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  );
}
