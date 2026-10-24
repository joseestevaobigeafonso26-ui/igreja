"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useVerse } from "@/lib/rtc";

type Item = { id: number; referencia: string; texto: string };

/**
 * Comando do texto bíblico (só equipa). Serve para o culto filmado com telemóvel, que não partilha janelas:
 * prepare os textos antes (ou cole na hora) e toque em "Mostrar". Aparece por cima do vídeo a todos.
 */
export default function VerseControl({ room }: { room: string }) {
  const atual = useVerse(room);
  const [ref, setRef] = useState("");
  const [texto, setTexto] = useState("");
  const [lista, setLista] = useState<Item[]>([]);
  const [pdf, setPdf] = useState<string | null>(null);
  const [auto, setAuto] = useState(0); // esconder sozinho após N segundos (0 = nunca)
  const [msg, setMsg] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("versiculos").select("*").order("ordem").order("id");
    if (error) setMsg("Execute o schema_v12.sql no Supabase. (" + error.message + ")"); else setLista((data ?? []) as Item[]);
    const { data: s } = await supabase.from("live_sessions").select("biblia_url").eq("room", room).single();
    setPdf(s?.biblia_url ?? null);
  }, [room]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function setVerso(v: { ref: string; texto: string } | null) {
    clearTimeout(timer.current);
    const { error } = await supabase.from("live_sessions").update({ verso: v }).eq("room", room);
    if (error) return setMsg(error.message);
    setMsg(v ? "No ecrã ✓" : "Escondido ✓");
    if (v && auto > 0) timer.current = setTimeout(() => setVerso(null), auto * 1000);
  }
  async function guardar() {
    if (!ref.trim() || !texto.trim()) return setMsg("Escreva a referência e o texto.");
    const { error } = await supabase.from("versiculos").insert({ referencia: ref.trim(), texto: texto.trim(), ordem: lista.length });
    setMsg(error ? error.message : "Guardado na lista ✓");
    if (!error) { setRef(""); setTexto(""); load(); }
  }
  async function apagar(id: number) {
    await supabase.from("versiculos").delete().eq("id", id);
    load();
  }
  async function enviarPdf(f: File | null) {
    if (!f) return;
    if (f.type !== "application/pdf") return setMsg("Escolha um ficheiro PDF.");
    if (f.size > 50 * 1024 * 1024) return setMsg("O PDF deve ter no máximo 50 MB.");
    setMsg("A enviar a Bíblia…");
    const path = `${Date.now()}-${f.name.replace(/[^\w.-]/g, "_")}`;
    const up = await supabase.storage.from("biblia").upload(path, f);
    if (up.error) return setMsg(up.error.message);
    const url = supabase.storage.from("biblia").getPublicUrl(path).data.publicUrl;
    const { error } = await supabase.from("live_sessions").update({ biblia_url: url }).not("room", "is", null);
    setMsg(error ? error.message : "Bíblia guardada ✓");
    if (!error) setPdf(url);
  }

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold">📖 Texto bíblico no ecrã <span className="font-normal text-slate-500">(opcional)</span></h3>
        {atual ? (
          <button onClick={() => setVerso(null)} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-bold text-white">Esconder agora</button>
        ) : <span className="text-xs text-slate-500">Nenhum texto no ecrã</span>}
      </div>
      {atual && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">No ecrã agora: <b>{atual.ref}</b></p>}

      <div className="space-y-2">
        <input className={input} placeholder="Referência (ex.: João 3:16)" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={80} />
        <textarea className={input} rows={3} placeholder="Cole aqui o texto (copie do PDF da Bíblia)" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={1500} />
        <div className="flex flex-wrap items-center gap-2">
          <button disabled={!ref.trim() || !texto.trim()} onClick={() => setVerso({ ref: ref.trim(), texto: texto.trim() })}
            className="rounded-lg bg-brand-terracotta px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Mostrar no ecrã</button>
          <button disabled={!ref.trim() || !texto.trim()} onClick={guardar}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40">Guardar na lista</button>
          <label className="ml-auto flex items-center gap-1 text-xs text-slate-600">Esconder sozinho:
            <select value={auto} onChange={(e) => setAuto(Number(e.target.value))} className="rounded border border-slate-300 px-1 py-1">
              <option value={0}>nunca</option><option value={15}>15 s</option><option value={30}>30 s</option><option value={60}>1 min</option>
            </select>
          </label>
        </div>
      </div>

      {lista.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-xs font-bold uppercase text-slate-500">Preparados antes do culto</h4>
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {lista.map((v) => (
              <div key={v.id} className="flex items-start gap-2 rounded-lg bg-white p-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{v.referencia}</p>
                  <p className="truncate text-xs text-slate-500">{v.texto}</p>
                </div>
                <button onClick={() => setVerso({ ref: v.referencia, texto: v.texto })} className="shrink-0 rounded bg-brand-terracotta px-2 py-1 text-xs font-bold text-white">Mostrar</button>
                <button onClick={() => apagar(v.id)} className="shrink-0 text-xs text-red-600 underline">Apagar</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2 text-sm">
        {pdf ? (
          <a href={pdf} target="_blank" rel="noreferrer" className="rounded-lg bg-slate-800 px-3 py-1.5 font-semibold text-white">📖 Abrir a Bíblia (PDF)</a>
        ) : <span className="text-xs text-slate-500">Sem Bíblia em PDF guardada.</span>}
        <label className="cursor-pointer text-xs font-semibold text-brand-terracotta underline">
          {pdf ? "Trocar o PDF" : "Enviar a Bíblia em PDF"}
          <input type="file" accept="application/pdf" className="hidden" onChange={(e) => enviarPdf(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      {msg && <p className="text-xs text-slate-600">{msg}</p>}
    </div>
  );
}
