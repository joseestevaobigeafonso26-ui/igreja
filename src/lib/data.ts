import { supabase } from "./supabase";

export async function getCourses(area: "discipulado" | "teologia") {
  const { data } = await supabase
    .from("courses")
    .select("*, lessons(id, titulo, video_url, ordem)")
    .eq("area", area)
    .order("ordem");
  return data ?? [];
}

export async function getAgenda() {
  const { data } = await supabase.from("agenda").select("*").order("dia_semana").order("hora");
  return data ?? [];
}

export async function getAvisos() {
  const { data } = await supabase.from("avisos").select("*").order("created_at", { ascending: false }).limit(5);
  return data ?? [];
}

export async function getLideranca() {
  const { data } = await supabase.from("lideranca").select("*").order("ordem");
  return data ?? [];
}

export async function getMinisterios() {
  const { data } = await supabase.from("ministerios").select("*").order("ordem");
  return data ?? [];
}

export async function getGaleria() {
  const { data } = await supabase.from("galeria").select("*").eq("aprovado", true).order("created_at", { ascending: false });
  return data ?? [];
}

/** Data de hoje (AAAA-MM-DD) e agora, no fuso de Angola, mesmo com o servidor noutro fuso. */
export function agoraLuanda() {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Luanda", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(new Date());
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const min = (Number(get("hour")) % 24) * 60 + Number(get("minute"));
  const hoje = new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Luanda" }).format(new Date());
  return { dia, min, hoje };
}

export async function getInfo() {
  const { data } = await supabase.from("igreja_info").select("*").eq("id", 1).maybeSingle();
  return data;
}

export async function getEventos(limit = 4) {
  const { hoje } = agoraLuanda();
  const { data } = await supabase.from("eventos").select("*").gte("data", hoje).order("data").order("hora").limit(limit);
  return data ?? [];
}

export async function getAoVivo() {
  const { data } = await supabase.from("live_sessions").select("room, titulo").eq("is_live", true);
  return data ?? [];
}
