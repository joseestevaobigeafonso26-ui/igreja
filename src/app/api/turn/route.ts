import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Guarda as credenciais temporárias em memória (6 h; o TTL pedido à Cloudflare é 24 h).
let cache: { servers: unknown[]; exp: number } | null = null;

/** Devolve servidores TURN (Metered ou Cloudflare) sem expor chaves ao navegador. Só para quem tem sessão (inclui anónimos). */
export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Sem sessão." }, { status: 401 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });

  // Metered Open Relay (20 GB/mês grátis): a API devolve diretamente a lista iceServers.
  const meteredApp = process.env.METERED_APP_NAME;
  const meteredKey = process.env.METERED_API_KEY;
  if (meteredApp && meteredKey) {
    if (cache && cache.exp > Date.now()) return NextResponse.json({ iceServers: cache.servers });
    const r = await fetch(`https://${meteredApp}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(meteredKey)}`);
    if (!r.ok) return NextResponse.json({ iceServers: [], error: `Metered respondeu ${r.status}` }, { status: 502 });
    const list = await r.json();
    const servers = Array.isArray(list) ? list : [];
    cache = { servers, exp: Date.now() + 3600 * 1000 };
    return NextResponse.json({ iceServers: servers });
  }

  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!keyId || !apiToken) return NextResponse.json({ iceServers: [], aviso: "Nenhum TURN configurado." });

  if (cache && cache.exp > Date.now()) return NextResponse.json({ iceServers: cache.servers });

  const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl: 86400 }),
  });
  if (!res.ok) return NextResponse.json({ iceServers: [], error: `Cloudflare respondeu ${res.status}` }, { status: 502 });

  const json = await res.json();
  const servers = Array.isArray(json.iceServers) ? json.iceServers : json.iceServers ? [json.iceServers] : [];
  cache = { servers, exp: Date.now() + 6 * 3600 * 1000 };
  return NextResponse.json({ iceServers: servers });
}
