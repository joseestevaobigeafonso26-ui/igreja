"use client";
import Link from "next/link";
import { useState } from "react";
import TableEditor, { type Field } from "@/components/TableEditor";
import UsersManager from "@/components/UsersManager";
import RemoteCamera from "@/components/RemoteCamera";
import BannerEditor from "@/components/BannerEditor";
import { useRole } from "@/lib/auth";

const T: Record<string, { label: string; fields: Field[]; orderBy?: string }> = {
  avisos: { label: "Avisos", fields: [{ key: "titulo", label: "Título" }, { key: "corpo", label: "Texto", type: "textarea" }], orderBy: "created_at" },
  agenda: {
    label: "Agenda", orderBy: "dia_semana",
    fields: [
      { key: "dia_semana", label: "Dia (0=Dom … 6=Sáb)", type: "number" }, { key: "hora", label: "Hora", type: "time" },
      { key: "titulo", label: "Título" }, { key: "descricao", label: "Descrição", type: "textarea" },
      { key: "local", label: "Local" }, { key: "transmissao", label: "Transmitido?", type: "checkbox" },
    ],
  },
  courses: {
    label: "Cursos", orderBy: "ordem",
    fields: [
      { key: "area", label: "Área", type: "select", options: ["discipulado", "teologia"] }, { key: "titulo", label: "Título" },
      { key: "descricao", label: "Descrição" }, { key: "formato", label: "Formato/estado" }, { key: "ordem", label: "Ordem", type: "number" },
    ],
  },
  lessons: {
    label: "Lições", orderBy: "course_id",
    fields: [
      { key: "course_id", label: "ID do curso", type: "number" }, { key: "titulo", label: "Título" },
      { key: "video_url", label: "Link do vídeo" }, { key: "ordem", label: "Ordem", type: "number" },
    ],
  },
  lideranca: {
    label: "Liderança", orderBy: "ordem",
    fields: [
      { key: "area", label: "Área", type: "select", options: ["pastoral", "diaconia", "ministerios"] },
      { key: "nome", label: "Nome" }, { key: "cargo", label: "Cargo" }, { key: "ordem", label: "Ordem", type: "number" },
    ],
  },
  galeria: {
    label: "Galeria (aprovar)", orderBy: "created_at",
    fields: [
      { key: "titulo", label: "Título" }, { key: "categoria", label: "Categoria" }, { key: "descricao", label: "Descrição" },
      { key: "imagem_url", label: "URL da imagem" }, { key: "aprovado", label: "Aprovada?", type: "checkbox" },
    ],
  },
  ministerios: {
    label: "Ministérios", orderBy: "ordem",
    fields: [{ key: "nome", label: "Nome" }, { key: "descricao", label: "Descrição" }, { key: "lider", label: "Líder" }, { key: "ordem", label: "Ordem", type: "number" }],
  },
};

function BannerPanel() {
  const rooms = [["culto", "Culto"], ["discipulado", "Discipulado"], ["teologia", "Teologia"], ["agenda", "Agenda"]];
  const [room, setRoom] = useState("culto");
  return (
    <div className="max-w-2xl space-y-3">
      <p className="text-sm text-slate-500">Texto que desliza no rodapé do vídeo enquanto a sala estiver ao vivo. É opcional; pode preparar antes e alterar durante a transmissão.</p>
      <div className="flex flex-wrap gap-2">
        {rooms.map(([k, l]) => (
          <button key={k} onClick={() => setRoom(k)}
            className={`rounded-lg px-3 py-2 text-sm ${room === k ? "bg-brand-terracotta font-semibold text-white" : "border border-slate-300 bg-white"}`}>{l}</button>
        ))}
      </div>
      <BannerEditor key={room} room={room} />
    </div>
  );
}

export default function Admin() {
  const { isStaff, canManageUsers, loading } = useRole();
  const [tab, setTab] = useState("avisos");
  if (loading) return null;
  if (!isStaff)
    return <p className="rounded-xl bg-white p-6">Área reservada à equipa. <Link href="/entrar" className="text-brand-terracotta underline">Entrar</Link></p>;
  const t = T[tab] ?? T.avisos;
  return (
    <>
      <h1 className="text-xl font-bold">Administração de conteúdo</h1>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setTab("banner")}
          className={`rounded-lg px-3 py-2 text-sm ${tab === "banner" ? "bg-brand-terracotta font-semibold text-white" : "bg-white"}`}>Banner ao vivo</button>
        <button onClick={() => setTab("camera")}
          className={`rounded-lg px-3 py-2 text-sm ${tab === "camera" ? "bg-brand-terracotta font-semibold text-white" : "bg-white"}`}>Câmara remota</button>
        {canManageUsers && (
          <button onClick={() => setTab("users")}
            className={`rounded-lg px-3 py-2 text-sm ${tab === "users" ? "bg-brand-terracotta font-semibold text-white" : "bg-white"}`}>Utilizadores</button>
        )}
        {Object.entries(T).map(([k, v]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-lg px-3 py-2 text-sm ${tab === k ? "bg-brand-terracotta font-semibold text-white" : "bg-white"}`}>{v.label}</button>
        ))}
      </div>
      {tab === "banner" ? <BannerPanel /> : tab === "camera" ? <RemoteCamera /> : tab === "users" && canManageUsers ? <UsersManager /> : <TableEditor key={tab} table={tab} fields={t.fields} orderBy={t.orderBy} />}
    </>
  );
}
