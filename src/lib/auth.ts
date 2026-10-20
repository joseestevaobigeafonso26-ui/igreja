"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type Role = "membro" | "professor" | "pastor" | "admin" | null;

/** Devolve o papel do utilizador autenticado (null = visitante). */
export function useRole() {
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.is_anonymous) { setRole(null); setLoading(false); return; }
      const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      setRole((data?.role as Role) ?? "membro");
      setLoading(false);
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => sub.subscription.unsubscribe();
  }, []);

  const isStaff = role === "professor" || role === "pastor" || role === "admin";
  const canManageUsers = role === "pastor" || role === "admin";
  return { role, isStaff, canManageUsers, loading };
}
