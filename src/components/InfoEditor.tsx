"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const CAMPOS: { k: string; l: string; area?: boolean; dica?: string }[] = [
  { k: "lema", l: "Lema da igreja" },
  { k: "sobre", l: "Quem somos", area: true },
  { k: "visao", l: "A nossa visão", area: true },
  { k: "endereco", l: "Endereço" },
  { k: "mapa_url", l: "Link do mapa (Google Maps)" },
  { k: "telefone", l: "Telefone" },
  { k: "whatsapp", l: "WhatsApp (com indicativo, ex.: 244923000000)" },
  { k: "email", l: "Email" },
  { k: "facebook", l: "Facebook (link)" },
  { k: "instagram", l: "Instagram (link)" },
  { k: "youtube", l: "YouTube (link)" },
  { k: "palavra_ref", l: "Palavra da semana — referência (ex.: Salmo 23:1)" },
  { k: "palavra_texto", l: "Palavra da semana — texto", area: true },
  { k: "ofertas_info", l: "Ofertas e dízimos (dados de conta, referência…)", area: true },
];

/** Informação que aparece na página Início. Tudo opcional: o que ficar vazio não aparece. */
export default function InfoEditor() {
  const [v, setV] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase.from("igreja_info").select("*").eq("id", 1).maybeSingle().then(({ data, error }) => {
      if (error) return setMsg("Execute o schema_v12.sql no Supabase. (" + error.message + ")");
      setV(Object.fromEntries(CAMPOS.map((c) => [c.k, (data as any)?.[c.k] ?? ""])));
    });
  }, []);

  async function guardar() {
    const row: Record<string, unknown> = { id: 1 };
    CAMPOS.forEach((c) => (row[c.k] = (v[c.k] ?? "").trim() || null));
    const { error } = await supabase.from("igreja_info").upsert(row);
    setMsg(error ? error.message : "Guardado ✓ — já aparece na página Início.");
  }

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  return (
    <div className="max-w-2xl space-y-3">
      <p className="text-sm text-slate-500">Estes dados aparecem na página Início. Deixe em branco o que não quiser mostrar.</p>
      {CAMPOS.map((c) => (
        <label key={c.k} className="block text-xs font-semibold text-slate-600">{c.l}
          {c.area
            ? <textarea className={`${input} mt-1`} rows={3} value={v[c.k] ?? ""} onChange={(e) => setV({ ...v, [c.k]: e.target.value })} />
            : <input className={`${input} mt-1`} value={v[c.k] ?? ""} onChange={(e) => setV({ ...v, [c.k]: e.target.value })} />}
        </label>
      ))}
      <button onClick={guardar} className="rounded-lg bg-brand-terracotta px-5 py-2 font-bold text-white">Guardar</button>
      {msg && <p className="text-sm text-slate-600">{msg}</p>}
    </div>
  );
}
