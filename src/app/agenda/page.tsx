import LiveRoom from "@/components/LiveRoom";
import { getAgenda, getAvisos } from "@/lib/data";

export const dynamic = "force-dynamic";
const DIAS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

export default async function Page() {
  const [agenda, avisos] = await Promise.all([getAgenda(), getAvisos()]);
  return (
    <>
      <div>
        <h1 className="text-xl font-bold">Agenda semanal e informações</h1>
        <p className="text-sm text-slate-500">Programação regular e eventos especiais.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          {agenda.map((a) => (
            <div key={a.id} className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="w-14 shrink-0 text-center">
                <p className="text-xs font-bold text-brand-terracotta">{DIAS[a.dia_semana]}</p>
                <p className="font-bold">{a.hora.slice(0, 5)}</p>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{a.titulo}</h3>
                <p className="text-sm text-slate-500">{a.descricao}</p>
              </div>
              <span className="self-start rounded-full bg-slate-100 px-2 py-1 text-xs">{a.local}</span>
            </div>
          ))}
          {avisos.map((a) => (
            <div key={a.id} className="rounded-xl bg-amber-50 p-4">
              <p className="font-semibold">{a.titulo}</p>
              <p className="text-sm text-slate-700">{a.corpo}</p>
            </div>
          ))}
        </div>
        <LiveRoom room="agenda" title="Informações ao vivo" />
      </div>
    </>
  );
}
