import { AccessToken } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { livekit, whoAmI } from "@/lib/aulaServer";

/** Dá acesso à sala só a quem está inscrito nela (ou a quem a dirige). Aluno entra sem poder publicar; sobe à cadeira quando autorizado. */
export async function POST(req: NextRequest) {
  try {
    const { sala_id } = await req.json();
    const me = await whoAmI(req, Number(sala_id));
    if (!me) return NextResponse.json({ error: "Não tem acesso a esta sala. Peça ao professor para o adicionar." }, { status: 403 });
    const { url, key, secret } = livekit();
    const at = new AccessToken(key, secret, {
      identity: me.user.id, name: me.nome, ttl: "6h", metadata: JSON.stringify({ host: me.isHost }),
    });
    at.addGrant({ room: me.room, roomJoin: true, canSubscribe: true, canPublish: me.isHost, canPublishData: true });
    return NextResponse.json({ token: await at.toJwt(), url, host: me.isHost, nome: me.nome });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Erro." }, { status: 500 });
  }
}
