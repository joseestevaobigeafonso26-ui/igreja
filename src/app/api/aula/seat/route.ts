import { TrackSource } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { livekit, whoAmI } from "@/lib/aulaServer";

const PERM_ON = { canPublish: true, canSubscribe: true, canPublishData: true, canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE] };
const PERM_OFF = { canPublish: false, canSubscribe: true, canPublishData: true };
const fail = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });

function parseMeta(m?: string) {
  try { const j = JSON.parse(m || "{}"); return { seats: Math.max(0, Math.min(8, Number(j.seats) || 0)), modo: j.modo === "livre" ? "livre" : "aprovar" }; }
  catch { return { seats: 0, modo: "aprovar" }; }
}
const isHostMeta = (m?: string) => { try { return JSON.parse(m || "{}").host === true; } catch { return false; } };

/** Cadeiras ao vivo. O servidor decide quem pode publicar: o aluno nunca se promove sozinho fora das regras da sala. */
export async function POST(req: NextRequest) {
  try {
    const { sala_id, action, identity, seats, modo } = await req.json();
    const me = await whoAmI(req, Number(sala_id));
    if (!me) return fail("Sem acesso.", 403);
    const { svc } = livekit();

    const rooms = await svc.listRooms([me.room]);
    if (!rooms.length) return fail("A aula ainda não começou.");
    const meta = parseMeta(rooms[0].metadata);
    const parts = await svc.listParticipants(me.room);
    const occupied = parts.filter((p) => p.permission?.canPublish && !isHostMeta(p.metadata)).length;
    const hostOnly = () => (me.isHost ? null : fail("Só o responsável da aula pode fazer isto.", 403));

    switch (action) {
      case "config": {
        const no = hostOnly(); if (no) return no;
        const next = { seats: Math.max(0, Math.min(8, Number(seats) || 0)), modo: modo === "livre" ? "livre" : "aprovar" };
        await svc.updateRoomMetadata(me.room, JSON.stringify(next));
        return NextResponse.json({ ok: true });
      }
      case "approve": {
        const no = hostOnly(); if (no) return no;
        if (occupied >= meta.seats) return fail("Não há cadeiras livres.");
        await svc.updateParticipant(me.room, String(identity), { permission: PERM_ON } as any);
        return NextResponse.json({ ok: true });
      }
      case "take": {
        if (me.isHost) return fail("O responsável não precisa de cadeira.");
        if (meta.modo !== "livre") return fail("O responsável aprova manualmente: peça a cadeira.", 403);
        if (occupied >= meta.seats) return fail("Não há cadeiras livres.");
        await svc.updateParticipant(me.room, me.user.id, { permission: PERM_ON } as any);
        return NextResponse.json({ ok: true });
      }
      case "leave":
        await svc.updateParticipant(me.room, me.user.id, { permission: PERM_OFF } as any);
        return NextResponse.json({ ok: true });
      case "revoke": {
        const no = hostOnly(); if (no) return no;
        await svc.updateParticipant(me.room, String(identity), { permission: PERM_OFF } as any);
        return NextResponse.json({ ok: true });
      }
      case "mute": {
        const no = hostOnly(); if (no) return no;
        const target = parts.find((p) => p.identity === String(identity));
        for (const t of target?.tracks ?? []) if (!t.muted) await svc.mutePublishedTrack(me.room, String(identity), t.sid, true);
        return NextResponse.json({ ok: true });
      }
      case "kick": {
        const no = hostOnly(); if (no) return no;
        await svc.removeParticipant(me.room, String(identity));
        return NextResponse.json({ ok: true });
      }
      case "end": {
        const no = hostOnly(); if (no) return no;
        await svc.deleteRoom(me.room);
        return NextResponse.json({ ok: true });
      }
      default:
        return fail("Ação desconhecida.");
    }
  } catch (e: any) {
    return fail(e.message ?? "Erro.", 500);
  }
}
