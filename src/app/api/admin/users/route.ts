import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const ROLES = ["membro", "professor", "pastor", "admin"];

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Só pastor/admin autenticados passam. Devolve o cliente admin e o id de quem chamou, ou o MOTIVO da recusa (texto). */
async function authorize(req: NextRequest): Promise<{ admin: ReturnType<typeof adminClient>; callerId: string } | string> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no servidor (Vercel → Settings → Environment Variables) — depois faça Redeploy.");
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token || token === "undefined") return "Sessão não recebida. Saia e entre de novo.";
  const admin = adminClient();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return "Sessão inválida ou expirada. Saia e entre de novo; se continuar, confira a chave SUPABASE_SERVICE_ROLE_KEY no Vercel.";
  if (user.is_anonymous) return "Entre com a sua conta de pastor/admin.";
  const { data: p } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!p) return "O servidor não consegue ler o seu perfil. Confira no Vercel a chave SUPABASE_SERVICE_ROLE_KEY: deve ser a service_role (secreta), NÃO a anon/publishable. Depois faça Redeploy.";
  const { data: act } = await admin.from("profiles").select("ativo").eq("id", user.id).single();
  if (act && act.ativo === false) return "A sua conta não está ativada.";
  if (!["pastor", "admin"].includes(p.role)) return `A sua conta tem o papel "${p.role}"; é preciso pastor ou admin.`;
  return { admin, callerId: user.id };
}

const fail = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

export async function GET(req: NextRequest) {
  try {
    const a = await authorize(req); if (typeof a === "string") return fail(a, 403);
    const { data } = await a.admin.auth.admin.listUsers({ perPage: 200 });
    const { data: profiles } = await a.admin.from("profiles").select("id, nome, role, ativo");
    const users = (data?.users ?? [])
      .filter((u) => !u.is_anonymous)
      .map((u) => {
        const p = profiles?.find((x) => x.id === u.id);
        return { id: u.id, email: u.email, nome: p?.nome ?? "", role: p?.role ?? "membro", ativo: p?.ativo ?? false, eu: u.id === a.callerId };
      });
    return NextResponse.json({ users });
  } catch (e: any) { return fail(e.message, 500); }
}

export async function POST(req: NextRequest) {
  try {
    const a = await authorize(req); if (typeof a === "string") return fail(a, 403);
    const { email, password, nome, role } = await req.json();
    if (!email || !password) return fail("Email e senha são obrigatórios.");
    if (String(password).length < 8) return fail("A senha deve ter pelo menos 8 caracteres.");
    if (!ROLES.includes(role)) return fail("Papel inválido.");
    const { data, error } = await a.admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) return fail(error?.message ?? "Erro ao criar utilizador.");
    // O trigger já criou o perfil; aqui definimos nome e papel.
    await a.admin.from("profiles").upsert({ id: data.user.id, nome: nome || String(email).split("@")[0], role, ativo: true });
    return NextResponse.json({ ok: true, id: data.user.id });
  } catch (e: any) { return fail(e.message, 500); }
}

export async function PATCH(req: NextRequest) {
  try {
    const a = await authorize(req); if (typeof a === "string") return fail(a, 403);
    const { id, role, nome, password, ativo } = await req.json();
    if (!id) return fail("Falta o id.");
    if (role !== undefined) {
      if (!ROLES.includes(role)) return fail("Papel inválido.");
      if (id === a.callerId) return fail("Não pode alterar o seu próprio papel.");
    }
    const patch: Record<string, string> = {};
    if (role !== undefined) patch.role = role;
    if (nome !== undefined) patch.nome = nome;
    if (ativo !== undefined) { if (id === a.callerId) return fail("Não pode alterar a sua própria ativação."); (patch as any).ativo = !!ativo; }
    if (Object.keys(patch).length) {
      const { error } = await a.admin.from("profiles").update(patch).eq("id", id);
      if (error) return fail(error.message);
    }
    if (password) {
      if (String(password).length < 8) return fail("A senha deve ter pelo menos 8 caracteres.");
      const { error } = await a.admin.auth.admin.updateUserById(id, { password });
      if (error) return fail(error.message);
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) { return fail(e.message, 500); }
}

export async function DELETE(req: NextRequest) {
  try {
    const a = await authorize(req); if (typeof a === "string") return fail(a, 403);
    const { id } = await req.json();
    if (!id) return fail("Falta o id.");
    if (id === a.callerId) return fail("Não pode apagar a sua própria conta.");
    const { error } = await a.admin.auth.admin.deleteUser(id);
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true });
  } catch (e: any) { return fail(e.message, 500); }
}
