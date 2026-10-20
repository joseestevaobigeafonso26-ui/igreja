"use client";
import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRole } from "@/lib/auth";

export default function GalleryUpload() {
  const { role, isStaff, loading } = useRole();
  const [file, setFile] = useState<File | null>(null);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (!role)
    return (
      <p className="rounded-xl bg-white p-4 text-sm">
        <Link href="/entrar" className="font-semibold text-brand-terracotta underline">Entre</Link> para partilhar uma foto.
      </p>
    );

  async function enviar() {
    if (!file || !titulo.trim()) return setMsg("Escolha uma imagem e escreva um título.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return setMsg("Use JPG, PNG ou WebP.");
    if (file.size > 5 * 1024 * 1024) return setMsg("A imagem deve ter no máximo 5 MB.");
    setBusy(true); setMsg("");
    const { data: { user } } = await supabase.auth.getUser();
    const path = `${user!.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const up = await supabase.storage.from("galeria").upload(path, file);
    if (up.error) { setBusy(false); return setMsg(up.error.message); }
    const url = supabase.storage.from("galeria").getPublicUrl(path).data.publicUrl;
    const ins = await supabase.from("galeria").insert({
      titulo, descricao: descricao || null, categoria: categoria || null, imagem_url: url, aprovado: isStaff,
    });
    setBusy(false);
    if (ins.error) return setMsg(ins.error.message);
    setFile(null); setTitulo(""); setDescricao(""); setCategoria("");
    setMsg(isStaff ? "Publicada ✓ (recarregue a página)" : "Enviada! Aparece na galeria depois da aprovação da liderança.");
  }

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  return (
    <div className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
      <h2 className="font-bold">Partilhar foto</h2>
      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
      <input className={input} placeholder="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      <input className={input} placeholder="Categoria (ex.: Batismos 2026)" value={categoria} onChange={(e) => setCategoria(e.target.value)} />
      <input className={input} placeholder="Descrição (opcional)" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      <button onClick={enviar} disabled={busy} className="rounded-lg bg-brand-terracotta px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
        {busy ? "A enviar…" : "Enviar"}
      </button>
      {msg && <p className="text-sm text-slate-600">{msg}</p>}
    </div>
  );
}
