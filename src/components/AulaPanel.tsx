"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import AulaRoom from "@/components/AulaRoom";
import { useRole } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

/** Aulas ao vivo: só para quem foi inscrito pelo administrador numa sala. */
export default function AulaPanel({ area }: { area: "discipulado" | "teologia" }) {
  const { role, loading } = useRole();
  const [salas, setSalas] = useState<{ id: number; nome: string }[] | null>(null);
  const [sel, setSel] = useState<number | null>(null);

  useEffect(() => {
    if (!role) { setSalas(null); setSel(null); return; }
    supabase.from("salas").select("id, nome").eq("area", area).eq("ativa", true).order("nome")
      .then(({ data }) => { setSalas(data ?? []); if (data?.length === 1) setSel(data[0].id); });
  }, [role, area]);

  if (loading) return null;
  if (!role)
    return (
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h2 className="font-bold">Aulas ao vivo</h2>
        <p className="text-sm text-slate-600">As aulas são só para alunos inscritos. Entre com o email e a senha que recebeu do professor ou do pastor.</p>
        <Link href="/entrar" className="inline-block rounded-lg bg-brand-terracotta px-5 py-2 font-bold text-white">Entrar</Link>
      </div>
    );
  if (!salas) return <p className="text-sm text-slate-500">A carregar as suas salas…</p>;
  if (salas.length === 0)
    return <p className="rounded-2xl bg-white p-6 text-center text-sm text-slate-600 shadow-sm">Ainda não foi adicionado a nenhuma sala. Fale com o professor ou com o pastor.</p>;

  const atual = salas.find((s) => s.id === sel);
  return (
    <div className="space-y-3">
      {salas.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {salas.map((s) => (
            <button key={s.id} onClick={() => setSel(s.id)}
              className={`rounded-lg px-3 py-2 text-sm ${sel === s.id ? "bg-brand-terracotta font-semibold text-white" : "border border-slate-300 bg-white"}`}>{s.nome}</button>
          ))}
        </div>
      )}
      {atual ? <AulaRoom key={atual.id} salaId={atual.id} nome={atual.nome} /> : <p className="text-sm text-slate-500">Escolha a sala.</p>}
    </div>
  );
}
