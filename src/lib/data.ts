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
