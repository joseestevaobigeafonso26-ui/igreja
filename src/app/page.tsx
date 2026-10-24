import Link from "next/link";
import { agoraLuanda, getAgenda, getAoVivo, getAvisos, getEventos, getGaleria, getInfo, getMinisterios } from "@/lib/data";

export const dynamic = "force-dynamic";

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const SALAS: Record<string, { label: string; href: string }> = {
  culto: { label: "Culto ao vivo", href: "/culto" },
  agenda: { label: "Informações ao vivo", href: "/agenda" },
};
const web = (u?: string | null) => (u ? (/^https?:\/\//i.test(u) ? u : `https://${u}`) : "");
const digitos = (s?: string | null) => (s ?? "").replace(/\D/g, "");

export default async function Inicio() {
  const [info, agenda, eventos, avisos, aoVivo, ministerios, galeria] = await Promise.all([
    getInfo(), getAgenda(), getEventos(4), getAvisos(), getAoVivo(), getMinisterios(), getGaleria(),
  ]);
  const { dia, min } = agoraLuanda();

  // Próximos encontros da semana, contados a partir de agora (hora de Angola)
  const proximos = agenda.map((a) => {
    const [h, m] = String(a.hora).split(":").map(Number);
    let dias = (a.dia_semana - dia + 7) % 7;
    if (dias === 0 && h * 60 + m < min) dias = 7;
    const quando = dias === 0 ? "Hoje" : dias === 1 ? "Amanhã" : DIAS[a.dia_semana];
    return { ...a, dias, quando, ordem: dias * 1440 + h * 60 + m };
  }).sort((a, b) => a.ordem - b.ordem).slice(0, 4);

  const aoVivoAgora = aoVivo.filter((s) => SALAS[s.room]);
  const zap = digitos(info?.whatsapp);

  return (
    <div className="space-y-8">
      {/* Topo */}
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-dark via-brand-charcoal to-brand-terracotta-dark p-6 text-white shadow-lg sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-300">Bem-vindo à</p>
        <h1 className="mt-1 text-2xl font-extrabold sm:text-4xl">Igreja Comunitária Batista do Vale do Quixicongo</h1>
        <p className="mt-2 max-w-2xl text-slate-200">{info?.lema ?? "Uma Igreja Voltada ao Discipulado"}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          {aoVivoAgora.length > 0 ? aoVivoAgora.map((s) => (
            <Link key={s.room} href={SALAS[s.room].href}
              className="badge-live rounded-xl bg-brand-terracotta px-5 py-3 font-bold text-white">● AO VIVO — {SALAS[s.room].label}</Link>
          )) : (
            <Link href="/agenda" className="rounded-xl bg-white/10 px-5 py-3 font-semibold ring-1 ring-white/30">Ver a agenda da semana</Link>
          )}
          <Link href="/culto" className="rounded-xl bg-amber-400 px-5 py-3 font-bold text-slate-900">Culto ao vivo</Link>
          {zap && <a href={`https://wa.me/${zap}`} target="_blank" rel="noreferrer" className="rounded-xl bg-green-600 px-5 py-3 font-bold text-white">WhatsApp</a>}
        </div>
      </section>

      {/* Encontros e eventos */}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-3 text-lg font-bold">Próximos encontros</h2>
          {proximos.length === 0 && <p className="text-sm text-slate-500">A agenda ainda não foi preenchida.</p>}
          <div className="space-y-3">
            {proximos.map((a) => (
              <div key={a.id} className="flex gap-4 rounded-xl border border-slate-100 p-3">
                <div className="w-20 shrink-0 text-center">
                  <p className={`text-xs font-bold uppercase ${a.dias === 0 ? "text-brand-terracotta" : "text-slate-500"}`}>{a.quando}</p>
                  <p className="text-lg font-extrabold">{String(a.hora).slice(0, 5)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{a.titulo}{a.transmissao && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">📡 AO VIVO</span>}</p>
                  {a.descricao && <p className="text-sm text-slate-500">{a.descricao}</p>}
                  {a.local && <p className="mt-1 text-xs text-slate-400">📍 {a.local}</p>}
                </div>
              </div>
            ))}
          </div>
          <Link href="/agenda" className="mt-3 inline-block text-sm font-semibold text-brand-terracotta underline">Agenda completa</Link>
        </section>

        <aside className="space-y-4">
          {info?.palavra_texto && (
            <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
              <p className="text-xs font-extrabold uppercase tracking-widest text-amber-700">📖 Palavra da semana</p>
              <p className="mt-2 font-serif text-lg leading-snug text-slate-800">“{info.palavra_texto}”</p>
              {info.palavra_ref && <p className="mt-2 text-sm font-semibold text-amber-800">{info.palavra_ref}</p>}
            </section>
          )}
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-2 font-bold">Eventos especiais</h2>
            {eventos.length === 0 && <p className="text-sm text-slate-500">Sem eventos marcados por agora.</p>}
            {eventos.map((e) => {
              const [, mm, dd] = String(e.data).split("-");
              return (
                <div key={e.id} className="mb-3 flex gap-3">
                  <div className={`w-12 shrink-0 rounded-lg py-1 text-center ${e.destaque ? "bg-brand-terracotta text-white" : "bg-slate-100"}`}>
                    <p className="text-lg font-extrabold leading-none">{dd}</p><p className="text-[10px] uppercase">/{mm}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{e.destaque && "⭐ "}{e.titulo}</p>
                    <p className="text-xs text-slate-500">{[e.hora ? String(e.hora).slice(0, 5) : "", e.local].filter(Boolean).join(" • ")}</p>
                  </div>
                </div>
              );
            })}
          </section>
        </aside>
      </div>

      {/* Avisos */}
      {avisos.length > 0 && (
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-bold">Avisos</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {avisos.map((a) => (
              <div key={a.id} className="border-l-4 border-brand-terracotta pl-3">
                <p className="font-semibold">{a.titulo}</p>
                <p className="text-sm text-slate-600">{a.corpo}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Atalhos */}
      <section>
        <h2 className="mb-3 text-lg font-bold">Aceda rapidamente</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[["/culto", "📡", "Culto ao vivo"], ["/discipulado", "🌱", "Discipulado"], ["/teologia", "📖", "Teologia"],
            ["/agenda", "🗓️", "Agenda"], ["/igreja", "⛪", "Igreja"], ["/galeria", "📷", "Galeria"]].map(([h, i, l]) => (
            <Link key={h} href={h} className="rounded-2xl bg-white p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <p className="text-3xl">{i}</p><p className="mt-1 text-sm font-semibold">{l}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Sobre */}
      {(info?.sobre || info?.visao) && (
        <section className="grid gap-4 md:grid-cols-2">
          {info?.sobre && <div className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="mb-2 font-bold">Quem somos</h2><p className="text-sm leading-relaxed text-slate-600">{info.sobre}</p></div>}
          {info?.visao && <div className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="mb-2 font-bold">A nossa visão</h2><p className="text-sm leading-relaxed text-slate-600">{info.visao}</p></div>}
        </section>
      )}

      {/* Ministérios e galeria */}
      {ministerios.length > 0 && (
        <section>
          <div className="mb-3 flex items-end justify-between"><h2 className="text-lg font-bold">Ministérios</h2><Link href="/igreja" className="text-sm font-semibold text-brand-terracotta underline">Ver todos</Link></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ministerios.slice(0, 4).map((m) => (
              <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold">{m.nome}</h3>
                <p className="mt-1 text-xs text-slate-500">{m.descricao}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      {galeria.length > 0 && (
        <section>
          <div className="mb-3 flex items-end justify-between"><h2 className="text-lg font-bold">Momentos recentes</h2><Link href="/galeria" className="text-sm font-semibold text-brand-terracotta underline">Galeria</Link></div>
          <div className="grid gap-3 sm:grid-cols-3">
            {galeria.slice(0, 3).map((f) => (
              <div key={f.id} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.imagem_url} alt={f.titulo} className="h-40 w-full object-cover" loading="lazy" />
                <p className="p-3 text-sm font-semibold">{f.titulo}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Contactos */}
      <section className="rounded-2xl bg-brand-dark p-6 text-white">
        <h2 className="mb-3 text-lg font-bold text-amber-300">Visite-nos e fale connosco</h2>
        <div className="grid gap-4 text-sm md:grid-cols-3">
          <div className="space-y-1">
            {info?.endereco && <p>📍 {info.endereco}</p>}
            {info?.mapa_url && <a href={web(info.mapa_url)} target="_blank" rel="noreferrer" className="font-semibold text-amber-300 underline">Ver no mapa</a>}
          </div>
          <div className="space-y-1">
            {info?.telefone && <p>📞 <a href={`tel:${digitos(info.telefone)}`}>{info.telefone}</a></p>}
            {zap && <p>💬 <a href={`https://wa.me/${zap}`} target="_blank" rel="noreferrer" className="underline">WhatsApp</a></p>}
            {info?.email && <p>✉️ <a href={`mailto:${info.email}`} className="underline">{info.email}</a></p>}
          </div>
          <div className="space-y-1">
            {info?.facebook && <p><a href={web(info.facebook)} target="_blank" rel="noreferrer" className="underline">Facebook</a></p>}
            {info?.instagram && <p><a href={web(info.instagram)} target="_blank" rel="noreferrer" className="underline">Instagram</a></p>}
            {info?.youtube && <p><a href={web(info.youtube)} target="_blank" rel="noreferrer" className="underline">YouTube</a></p>}
          </div>
        </div>
        {info?.ofertas_info && <p className="mt-4 whitespace-pre-line rounded-lg bg-white/10 p-3 text-sm"><b>Ofertas e dízimos:</b>{"\n"}{info.ofertas_info}</p>}
        {!info?.endereco && !info?.telefone && !info?.email && <p className="text-sm text-slate-300">Os contactos aparecem aqui quando forem preenchidos no Admin → Info da igreja.</p>}
      </section>
    </div>
  );
}
