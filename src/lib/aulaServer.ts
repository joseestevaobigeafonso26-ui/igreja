import { createClient } from "@supabase/supabase-js";
import { RoomServiceClient } from "livekit-server-sdk";
import type { NextRequest } from "next/server";

export function adminDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function livekit() {
  const url = process.env.LIVEKIT_URL, key = process.env.LIVEKIT_API_KEY, secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) throw new Error("LiveKit não configurado no servidor (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET).");
  const http = url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  return { url, key, secret, svc: new RoomServiceClient(http, key, secret) };
}

/** Quem está a pedir e que papel tem nesta sala. null = sem acesso (visitantes anónimos nunca entram). */
export async function whoAmI(req: NextRequest, salaId: number) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token || !salaId) return null;
  const db = adminDb();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user || user.is_anonymous) return null;
  const { data: p } = await db.from("profiles").select("nome, role, ativo").eq("id", user.id).single();
  if (!p?.ativo) return null;
  const { data: sala } = await db.from("salas").select("id, nome, area, professor_id, ativa").eq("id", salaId).single();
  if (!sala || !sala.ativa) return null;
  const isHost = ["pastor", "admin"].includes(p.role) || sala.professor_id === user.id;
  let isMember = false;
  if (!isHost) {
    const { data: m } = await db.from("sala_membros").select("user_id").eq("sala_id", salaId).eq("user_id", user.id).maybeSingle();
    isMember = !!m;
  }
  if (!isHost && !isMember) return null;
  return { user, nome: (p.nome as string) || user.email || "Aluno", sala, isHost, room: `sala-${sala.id}` };
}
