import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const ROLES = ["membro", "professor", "pastor", "admin"];

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Só pastor/admin autenticados passam. Devolve o cliente admin e o id de quem chamou. */
async function authorize(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.");
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const admin = adminClient();
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user || user.is_anonymous) return null;
  const { data: p } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!p || !["pastor", "admin"].includes(p.role)) return null;
  return { admin, callerId: user.id };
}

const fail = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

export async function GET(req: NextRequest) {
  try {
    const a = await authorize(req); if (!a) return fail("Sem permissão.", 403);
    const { data } = await a.admin.auth.admin.listUsers({ perPage: 200 });
    const { data: profiles } = await a.admin.from("profiles").select("id, nome, role");
    const users = (data?.users ?? [])
      .filter((u) => !u.is_anonymous)
      .map((u) => {
        const p = profiles?.find((x) => x.id === u.id);
        return { id: u.id, email: u.email, nome: p?.nome ?? "", role: p?.role ?? "membro", eu: u.id === a.callerId };
      });
    return NextResponse.json({ users });
  } catch (e: any) { return fail(e.message, 500); }
}

export async function POST(req: NextRequest) {
  try {
    const a = await authorize(req); if (!a) return fail("Sem permissão.", 403);
    const { email, password, nome, role } = await req.json();
    if (!email || !password) return fail("Email e senha são obrigatórios.");
    if (String(password).length < 8) return fail("A senha deve ter pelo menos 8 caracteres.");
    if (!ROLES.includes(role)) return fail("Papel inválido.");
    const { data, error } = await a.admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) return fail(error?.message ?? "Erro ao criar utilizador.");
    // O trigger já criou o perfil; aqui definimos nome e papel.
    await a.admin.from("profiles").upsert({ id: data.user.id, nome: nome || String(email).split("@")[0], role });
    return NextResponse.json({ ok: true });
  } catch (e: any) { return fail(e.message, 500); }
}

export async function PATCH(req: NextRequest) {
  try {
    const a = await authorize(req); if (!a) return fail("Sem permissão.", 403);
    const { id, role, nome, password } = await req.json();
    if (!id) return fail("Falta o id.");
    if (role !== undefined) {
      if (!ROLES.includes(role)) return fail("Papel inválido.");
      if (id === a.callerId) return fail("Não pode alterar o seu próprio papel.");
    }
    const patch: Record<string, string> = {};
    if (role !== undefined) patch.role = role;
    if (nome !== undefined) patch.nome = nome;
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
    const a = await authorize(req); if (!a) return fail("Sem permissão.", 403);
    const { id } = await req.json();
    if (!id) return fail("Falta o id.");
    if (id === a.callerId) return fail("Não pode apagar a sua própria conta.");
    const { error } = await a.admin.auth.admin.deleteUser(id);
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true });
  } catch (e: any) { return fail(e.message, 500); }
}
