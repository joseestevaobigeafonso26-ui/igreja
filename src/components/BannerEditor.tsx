"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/** Editor do banner de informações de uma sala. Opcional: vazio ou desligado = sem banner. */
export default function BannerEditor({ room, compact = false }: { room: string; compact?: boolean }) {
  const [texto, setTexto] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setMsg("");
    supabase.from("live_sessions").select("banner, banner_ativo").eq("room", room).single()
      .then(({ data, error }) => {
        if (error) return setMsg("Execute o schema_v9.sql no Supabase. (" + error.message + ")");
        setTexto(data?.banner ?? ""); setAtivo(data?.banner_ativo ?? true);
      });
  }, [room]);

  async function guardar() {
    const { error } = await supabase.from("live_sessions").update({ banner: texto.trim() || null, banner_ativo: ativo }).eq("room", room);
    setMsg(error ? error.message : "Guardado ✓ — já aparece a quem está a assistir.");
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">Banner de informações <span className="font-normal text-slate-500">(opcional)</span></h3>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Mostrar
        </label>
      </div>
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={compact ? 2 : 4} maxLength={600}
        placeholder={"Uma informação por linha. Ex.:\nCulto de jovens na sexta às 18h\nInscrições abertas para o batismo"}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <div className="flex items-center gap-3">
        <button onClick={guardar} className="rounded-lg bg-brand-terracotta px-4 py-2 text-sm font-bold text-white">Guardar banner</button>
        {texto && <button onClick={() => setTexto("")} className="text-xs text-slate-600 underline">Limpar texto</button>}
        <span className="text-xs text-slate-500">{texto.length}/600</span>
      </div>
      {msg && <p className="text-xs text-slate-600">{msg}</p>}
    </div>
  );
}
