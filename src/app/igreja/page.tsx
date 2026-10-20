import { getLideranca, getMinisterios } from "@/lib/data";

export const dynamic = "force-dynamic";

const GRUPOS = [
  { area: "pastoral", titulo: "Área Pastoral", sub: "Direção espiritual, visão do discipulado e doutrina bíblica" },
  { area: "diaconia", titulo: "Área da Diaconia", sub: "Serviço prático, ordem, ação social e assistência às famílias" },
  { area: "ministerios", titulo: "Líderes dos Ministérios Executivos", sub: "Responsáveis operacionais pelos departamentos e grupos de trabalho" },
];

export default async function Page() {
  const [lideres, ministerios] = await Promise.all([getLideranca(), getMinisterios()]);
  return (
    <>
      <div>
        <h1 className="text-xl font-bold">Liderança e ministérios</h1>
        <p className="text-sm text-slate-500">Estrutura da igreja e responsáveis por cada área.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {GRUPOS.map((g) => (
          <section key={g.area} className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="font-bold text-brand-terracotta">{g.titulo}</h2>
            <p className="mb-3 text-xs text-slate-500">{g.sub}</p>
            <ul className="space-y-2">
              {lideres.filter((l) => l.area === g.area).map((l) => (
                <li key={l.id} className="border-l-4 border-amber-400 pl-3">
                  <p className="text-sm font-semibold">{l.nome}</p>
                  <p className="text-xs text-slate-500">{l.cargo}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section>
        <h2 className="mb-3 text-lg font-bold">Ministérios ativos ({ministerios.length})</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ministerios.map((m, i) => (
            <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="font-semibold">{i + 1}. {m.nome}</h3>
              <p className="text-sm text-slate-500">{m.descricao}</p>
              <p className="mt-2 text-xs"><b>Líder:</b> {m.lider}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
