"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type Field = { key: string; label: string; type?: "text" | "number" | "time" | "checkbox" | "textarea" | "select"; options?: string[] };
type Row = Record<string, any>;

function Input({ f, value, onChange }: { f: Field; value: any; onChange: (v: any) => void }) {
  const base = "w-full rounded border border-slate-300 px-2 py-1 text-sm";
  if (f.type === "checkbox")
    return <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
  if (f.type === "select")
    return (
      <select className={base} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>—</option>
        {f.options!.map((o) => <option key={o}>{o}</option>)}
      </select>
    );
  if (f.type === "textarea")
    return <textarea className={base} rows={2} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
  return (
    <input className={base} type={f.type ?? "text"} value={value ?? ""}
      onChange={(e) => onChange(f.type === "number" ? Number(e.target.value) : e.target.value)} />
  );
}

export default function TableEditor({ table, fields, orderBy = "id" }: { table: string; fields: Field[]; orderBy?: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [draft, setDraft] = useState<Row>({});
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.from(table).select("*").order(orderBy);
    if (error) setMsg(error.message); else setRows(data ?? []);
  }, [table, orderBy]);
  useEffect(() => { load(); }, [load]);

  const edit = (id: number, key: string, v: any) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: v } : r)));

  async function save(row: Row) {
    const { id, ...rest } = row;
    const payload: Row = {};
    fields.forEach((f) => (payload[f.key] = rest[f.key] === "" ? null : rest[f.key]));
    const { error } = await supabase.from(table).update(payload).eq("id", id);
    setMsg(error ? error.message : "Guardado ✓");
  }
  async function remove(id: number) {
    if (!confirm("Apagar este registo?")) return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    setMsg(error ? error.message : "Apagado ✓");
    load();
  }
  async function add() {
    const { error } = await supabase.from(table).insert(draft);
    if (error) return setMsg(error.message);
    setDraft({}); setMsg("Adicionado ✓"); load();
  }

  return (
    <div className="space-y-3">
      {msg && <p className="text-sm text-slate-600">{msg}</p>}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>{fields.map((f) => <th key={f.key} className="px-2 py-2">{f.label}</th>)}<th /></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 align-top">
                {fields.map((f) => (
                  <td key={f.key} className="min-w-[8rem] px-2 py-1">
                    <Input f={f} value={f.type === "time" ? String(r[f.key] ?? "").slice(0, 5) : r[f.key]} onChange={(v) => edit(r.id, f.key, v)} />
                  </td>
                ))}
                <td className="whitespace-nowrap px-2 py-1">
                  <button onClick={() => save(r)} className="mr-2 text-sm font-semibold text-green-700">Guardar</button>
                  <button onClick={() => remove(r.id)} className="text-sm text-red-600">Apagar</button>
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-amber-300 bg-amber-50 align-top">
              {fields.map((f) => (
                <td key={f.key} className="px-2 py-1">
                  <Input f={f} value={draft[f.key]} onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />
                </td>
              ))}
              <td className="px-2 py-1"><button onClick={add} className="text-sm font-bold text-brand-terracotta">+ Adicionar</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
