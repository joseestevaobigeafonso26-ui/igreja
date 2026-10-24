"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useRole } from "@/lib/auth";

const links = [
  { href: "/", label: "Início" },
  { href: "/culto", label: "Culto ao vivo" },
  { href: "/discipulado", label: "Discipulado" },
  { href: "/teologia", label: "Teologia" },
  { href: "/agenda", label: "Agenda" },
  { href: "/igreja", label: "Igreja" },
  { href: "/galeria", label: "Galeria" },
];

export default function Nav() {
  const path = usePathname();
  const { role, isStaff } = useRole();
  return (
    <header className="sticky top-0 z-50 border-b border-amber-500/20 bg-brand-dark text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="text-sm font-bold uppercase tracking-wider text-amber-400">
          Igreja Comunitária Batista do Vale do Quixicongo
          <span className="block text-[11px] font-normal normal-case italic text-slate-300">Uma Igreja Voltada ao Discipulado</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href}
              className={`rounded-lg px-3 py-2 ${path === l.href ? "bg-brand-terracotta font-semibold" : "text-slate-300 hover:bg-brand-charcoal"}`}>
              {l.label}
            </Link>
          ))}
          {isStaff && (
            <Link href="/admin" className={`rounded-lg px-3 py-2 ${path === "/admin" ? "bg-brand-terracotta font-semibold" : "text-slate-300 hover:bg-brand-charcoal"}`}>Admin</Link>
          )}
          {role ? (
            <button onClick={() => supabase.auth.signOut()} className="rounded-lg px-3 py-2 text-slate-300 hover:bg-brand-charcoal">
              Sair ({role})
            </button>
          ) : (
            <Link href="/entrar" className="rounded-lg px-3 py-2 text-slate-300 hover:bg-brand-charcoal">Entrar</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
