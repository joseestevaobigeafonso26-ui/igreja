"use client";
import type { CameraOpts } from "@/lib/rtc";

/** Escolha de orientação (horizontal/vertical) e de câmara (traseira/frontal). Pode usar-se antes e durante a transmissão. */
export default function CameraControls({ value, onChange }: { value: Required<CameraOpts>; onChange: (v: Required<CameraOpts>) => void }) {
  const b = (active: boolean) =>
    `rounded-lg px-3 py-2 text-sm ${active ? "bg-brand-terracotta font-semibold text-white" : "border border-slate-300 bg-white text-slate-700"}`;
  return (
    <div className="space-y-2">
      <div>
        <p className="mb-1 text-xs font-semibold text-slate-600">Imagem</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={b(value.orientation === "horizontal")}
            onClick={() => onChange({ ...value, orientation: "horizontal" })}>▭ Horizontal</button>
          <button type="button" className={b(value.orientation === "vertical")}
            onClick={() => onChange({ ...value, orientation: "vertical" })}>▯ Vertical</button>
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold text-slate-600">Câmara</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={b(value.facing === "environment")}
            onClick={() => onChange({ ...value, facing: "environment" })}>📷 Traseira</button>
          <button type="button" className={b(value.facing === "user")}
            onClick={() => onChange({ ...value, facing: "user" })}>🤳 Frontal</button>
        </div>
      </div>
    </div>
  );
}
