import { NextRequest, NextResponse } from "next/server";
import { adminDb, whoAmI } from "@/lib/aulaServer";

export const dynamic = "force-dynamic";

/**
 * Diz ao navegador quem é quem nesta sala. Quem dirige a aula recebe também a lista de alunos inscritos
 * (uid + nome), que o servidor lê do cadastro: é assim que o professor sabe o nome VERDADEIRO de quem fala,
 * mesmo que o aluno tente fingir outro nome.
 */
export async function POST(req: NextRequest) {
  try {
    const { sala_id } = await req.json();
    const me = await whoAmI(req, Number(sala_id));
    if (!me) return NextResponse.json({ error: "Não tem acesso a esta sala. Peça ao professor para o adicionar." }, { status: 403 });

    let roster: { uid: string; nome: string }[] = [];
    if (me.isHost) {
      const db = adminDb();
      const { data: m } = await db.from("sala_membros").select("user_id").eq("sala_id", me.sala.id);
      const ids = (m ?? []).map((r) => r.user_id as string).filter((id) => id !== me.user.id);
      if (ids.length) {
        const { data: ps } = await db.from("profiles").select("id, nome").in("id", ids);
        const nomes = new Map((ps ?? []).map((p) => [p.id as string, (p.nome as string) || "Aluno"]));
        roster = ids.map((uid) => ({ uid, nome: nomes.get(uid) ?? "Aluno" }));
      }
    }
    return NextResponse.json({ uid: me.user.id, nome: me.nome, host: me.isHost, sala: { id: me.sala.id, nome: me.sala.nome }, roster });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Erro." }, { status: 500 });
  }
}
