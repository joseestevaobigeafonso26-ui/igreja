"use client";
import { supabase } from "@/lib/supabase";

/** Chamada autenticada às rotas /api/aula/*. */
export async function aulaApi<T = any>(path: string, body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? "Erro.");
  return j as T;
}
