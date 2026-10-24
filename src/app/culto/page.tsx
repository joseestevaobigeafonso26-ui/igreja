import LiveRoom from "@/components/LiveRoom";
import { getAgenda, getAvisos } from "@/lib/data";

export const dynamic = "force-dynamic";
const DIAS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

export default async function Home() {
  const [avisos, agenda] = await Promise.all([getAvisos(), getAgenda()]);
  const proximos = agenda.filter((a) => a.transmissao).slice(0, 3);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <LiveRoom room="culto" title="Culto ao vivo" />
      </div>
      <aside className="space-y-4">
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-bold">Avisos</h2>
          {avisos.map((a) => (
            <div key={a.id} className="mb-2 border-l-4 border-brand-terracotta pl-3">
              <p className="text-sm font-semibold">{a.titulo}</p>
              <p className="text-sm text-slate-600">{a.corpo}</p>
            </div>
          ))}
        </section>
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-bold">Próximas transmissões</h2>
          {proximos.map((a) => (
            <p key={a.id} className="text-sm"><b>{DIAS[a.dia_semana]} {a.hora.slice(0, 5)}</b> — {a.titulo}</p>
          ))}
        </section>
      </aside>
    </div>
  );
}
