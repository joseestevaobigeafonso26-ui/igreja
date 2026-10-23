"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import Interaction from "@/components/Interaction";
import { useIdentity, useLiveFeed } from "@/lib/liveFeed";
import { useRole } from "@/lib/auth";

const ROOMS: Record<string, { titulo: string; mode: "simples" | "interativo" }> = {
  culto: { titulo: "Culto ao vivo", mode: "simples" },
  agenda: { titulo: "Agenda / informações", mode: "simples" },
};

/** Janela do responsável: reações e comentários grandes, para abrir noutro ecrã, telemóvel ou tablet. */
export default function Painel() {
  const { room } = useParams<{ room: string }>();
  const { isStaff, loading } = useRole();
  const id = useIdentity();
  const cfg = ROOMS[room];
  const feed = useLiveFeed(room, !!cfg && isStaff, id, true); // observador: não conta como participante

  if (loading) return null;
  if (!cfg) return <p className="rounded-xl bg-white p-6">Sala inexistente.</p>;
  if (!isStaff)
    return <p className="rounded-xl bg-white p-6">Área reservada à equipa. <Link href="/entrar" className="text-brand-terracotta underline">Entrar</Link></p>;

  return (
    <div className="mx-auto max-w-xl space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <h1 className="text-lg font-bold">Painel ao vivo — {cfg.titulo}</h1>
      <p className="text-xs text-slate-500">Deixe esta janela aberta. Os comentários só abrem enquanto a transmissão estiver ao vivo.</p>
      <Interaction mode={cfg.mode} feed={feed} id={id} tall />
    </div>
  );
}
