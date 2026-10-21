"use client";
/**
 * WebRTC com sinalização via Supabase Realtime (canal broadcast "live:<sala>").
 * Topologia: o transmissor abre uma RTCPeerConnection por espectador (malha 1→N).
 * Funciona bem para dezenas de espectadores; para centenas, troque por um SFU (ex.: LiveKit).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";

const iceServers: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];
if (process.env.NEXT_PUBLIC_TURN_URL) {
  iceServers.push({
    // Várias URLs separadas por vírgula (udp 80/443 e tcp/tls 443 aumentam a chance de passar redes móveis)
    urls: process.env.NEXT_PUBLIC_TURN_URL.split(",").map((u) => u.trim()).filter(Boolean),
    username: process.env.NEXT_PUBLIC_TURN_USER,
    credential: process.env.NEXT_PUBLIC_TURN_CRED,
  });
}

// Credenciais TURN temporárias vêm de /api/turn (Cloudflare). Guardadas 1 h no navegador.
let cachedCfg: { cfg: RTCConfiguration; at: number } | null = null;
async function rtcConfig(): Promise<RTCConfiguration> {
  if (cachedCfg && Date.now() - cachedCfg.at < 3600_000) return cachedCfg.cfg;
  let extra: RTCIceServer[] = [];
  try {
    const { data } = await supabase.auth.getSession();
    const res = await fetch("/api/turn", { headers: { Authorization: `Bearer ${data.session?.access_token}` } });
    if (res.ok) {
      const j = await res.json();
      if (Array.isArray(j.iceServers)) extra = j.iceServers;
    }
  } catch {}
  const cfg: RTCConfiguration = { iceServers: [...iceServers, ...extra] };
  if (extra.length) cachedCfg = { cfg, at: Date.now() }; // só guarda se o TURN respondeu
  return cfg;
}
/** Sessão + configuração ICE prontas ANTES de abrir canais (evita perder candidatos ICE). */
async function prepare() {
  await ensureSession();
  return rtcConfig();
}

type Signal =
  | { type: "viewer-join"; from: string }
  | { type: "viewer-leave"; from: string }
  | { type: "offer"; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; to: "host"; from: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; to: string; from: string; candidate: RTCIceCandidateInit }
  | { type: "broadcaster-ready" }
  | { type: "broadcaster-stop" };

// Candidatos ICE que chegam antes da descrição remota ficam em fila.
const queues = new WeakMap<RTCPeerConnection, RTCIceCandidateInit[]>();
async function addIce(pc: RTCPeerConnection, c: RTCIceCandidateInit) {
  if (pc.remoteDescription) await pc.addIceCandidate(c).catch(() => {});
  else queues.set(pc, [...(queues.get(pc) ?? []), c]);
}
async function flushIce(pc: RTCPeerConnection) {
  for (const c of queues.get(pc) ?? []) await pc.addIceCandidate(c).catch(() => {});
  queues.delete(pc);
}

type Link = { send: (s: Signal) => void; close: () => void };
const MAX_VIEWERS = 40; // proteção contra abuso/sobrecarga do transmissor

/** Garante sessão (anónima para espectadores) e token no Realtime — canais privados exigem isso. */
async function ensureSession() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw new Error("Ative \"Allow anonymous sign-ins\" no Supabase (Authentication → Sign In / Providers).");
  }
  await supabase.realtime.setAuth();
}

/**
 * Dois canais privados por sala, um por sentido:
 *  live:<sala>:host    → só a equipa envia (ofertas, ICE, estado); todos recebem
 *  live:<sala>:viewers → todos enviam (entrar, resposta, ICE); só a equipa recebe
 * Assim ninguém sem papel de equipa consegue forjar uma oferta de vídeo.
 */
async function openChannel(room: string, side: "host" | "viewer", onSignal: (s: Signal) => void): Promise<Link> {
  await ensureSession();
  const rxTopic = `live:${room}:${side === "host" ? "viewers" : "host"}`;
  const txTopic = `live:${room}:${side === "host" ? "host" : "viewers"}`;
  // Evita reutilizar canais já inscritos (React StrictMode monta duas vezes em dev).
  supabase.getChannels()
    .filter((c) => c.topic === `realtime:${rxTopic}` || c.topic === `realtime:${txTopic}`)
    .forEach((c) => supabase.removeChannel(c));

  const cfg = { config: { private: true, broadcast: { self: false } } };
  const rx = supabase.channel(rxTopic, cfg);
  const tx = supabase.channel(txTopic, cfg);
  rx.on("broadcast", { event: "signal" }, ({ payload }) => onSignal(payload as Signal));
  const sub = (ch: RealtimeChannel) =>
    new Promise<void>((res, rej) =>
      ch.subscribe((st) => {
        if (st === "SUBSCRIBED") res();
        else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT")
          rej(new Error("Sem permissão no canal de transmissão. Execute o schema_v4.sql e confirme o login."));
      })
    );
  await Promise.all([sub(rx), sub(tx)]);
  return {
    send: (payload) => { tx.send({ type: "broadcast", event: "signal", payload }); },
    close: () => { supabase.removeChannel(rx); supabase.removeChannel(tx); },
  };
}

export type Source = "tela" | "camera";

/* ───────────── Transmissor (pastor / professor) ───────────── */
export function useBroadcaster(room: string) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [viewers, setViewers] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const chRef = useRef<Link | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const externalRef = useRef(false); // true quando a fonte é um stream recebido (câmara remota)

  const stop = useCallback(async () => {
    chRef.current?.send({ type: "broadcaster-stop" });
    peers.current.forEach((pc) => pc.close());
    peers.current.clear();
    if (!externalRef.current) streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    externalRef.current = false;
    chRef.current?.close();
    chRef.current = null;
    setStream(null);
    setViewers(0);
    await supabase.from("live_sessions").update({ is_live: false }).eq("room", room);
  }, [room]);

  const start = useCallback(async (source: Source | MediaStream) => {
    setError(null);
    try {
      // IMPORTANTE: isto é chamado a partir de um clique (exigência dos navegadores).
      let media: MediaStream;
      if (source instanceof MediaStream) {
        media = source; // retransmitir o que o telemóvel está a filmar
        externalRef.current = true;
      } else if (source === "tela") {
        if (!navigator.mediaDevices?.getDisplayMedia)
          throw new Error("Este dispositivo não suporta partilha de ecrã. Use a opção Câmara.");
        media = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
        // Se o ecrã não trouxer áudio, junta o microfone para a voz do pregador.
        if (media.getAudioTracks().length === 0) {
          try {
            const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
            mic.getAudioTracks().forEach((t) => media.addTrack(t));
          } catch {}
        }
      } else {
        media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 } },
          audio: true,
        });
      }
      streamRef.current = media;
      const vt = media.getVideoTracks()[0];
      if (vt) vt.onended = () => stop(); // botão "Parar partilha" do navegador

      const cfg = await prepare();
      let link: Link | undefined;
      const send = (p: Signal) => link?.send(p);
      link = await openChannel(room, "host", async (s) => {
        if (s.type === "viewer-join") {
          if (!peers.current.has(s.from) && peers.current.size >= MAX_VIEWERS) return;
          peers.current.get(s.from)?.close();
          const pc = new RTCPeerConnection(cfg);
          peers.current.set(s.from, pc);
          media.getTracks().forEach((t) => pc.addTrack(t, media));
          pc.onicecandidate = (e) =>
            e.candidate && send({ type: "ice", to: s.from, from: "host", candidate: e.candidate.toJSON() });
          pc.onconnectionstatechange = () => {
            if (["failed", "closed"].includes(pc.connectionState)) {
              pc.close();
              peers.current.delete(s.from);
              setViewers(peers.current.size);
            } else if (pc.connectionState === "connected") setViewers(peers.current.size);
          };
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          // ~800 kbps: poupa dados dos espectadores e o limite gratuito do TURN.
          pc.getSenders().forEach((sd) => {
            if (sd.track?.kind !== "video") return;
            const params = sd.getParameters();
            if (!params.encodings?.length) return;
            params.encodings[0].maxBitrate = 800_000;
            sd.setParameters(params).catch(() => {});
          });
          send({ type: "offer", to: s.from, sdp: pc.localDescription! });
        } else if (s.type === "answer") {
          const pc = peers.current.get(s.from);
          if (pc) { await pc.setRemoteDescription(s.sdp); await flushIce(pc); }
        } else if (s.type === "ice") {
          const pc = peers.current.get(s.from);
          if (pc) await addIce(pc, s.candidate);
        } else if (s.type === "viewer-leave") {
          peers.current.get(s.from)?.close();
          peers.current.delete(s.from);
          setViewers(peers.current.size);
        }
      });
      chRef.current = link;
      await supabase.from("live_sessions").update({ is_live: true, started_at: new Date().toISOString() }).eq("room", room);
      send({ type: "broadcaster-ready" }); // espectadores já na página reconectam
      setStream(media);
    } catch (e: any) {
      setError(e?.name === "NotAllowedError" ? "Permissão negada." : e?.message ?? "Erro ao iniciar.");
      await stop();
    }
  }, [room, stop]);

  useEffect(() => () => { if (streamRef.current) stop(); }, [stop]);
  return { stream, viewers, error, start, stop };
}

/* ───────────── Espectador (qualquer pessoa) ───────────── */
export function useViewer(room: string) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("A preparar…");

  useEffect(() => {
    const id = crypto.randomUUID();
    let retry: ReturnType<typeof setInterval> | undefined;
    let gotOffer = false;
    let pc: RTCPeerConnection | null = null;
    let link: Link | undefined;
    let cancelled = false;

    (async () => {
      try {
        const cfg = await prepare();
        const l = await openChannel(room, "viewer", async (s) => {
          if (s.type === "broadcaster-ready") { gotOffer = false; setStatus("A pedir a transmissão…"); return l.send({ type: "viewer-join", from: id }); }
          if (s.type === "broadcaster-stop") { pc?.close(); pc = null; setStream(null); setStatus("Transmissão terminada."); return; }
          if (!("to" in s) || s.to !== id) return;

          if (s.type === "offer") {
            pc?.close();
            gotOffer = true;
            setStatus("A negociar a ligação de vídeo…");
            const conn = (pc = new RTCPeerConnection(cfg));
            conn.ontrack = (e) => { setStream(e.streams[0]); setStatus("Ligado"); };
            conn.onconnectionstatechange = () => {
              if (conn.connectionState === "failed")
                setStatus("A rede bloqueou a ligação direta. É preciso um servidor TURN (ver README).");
              else if (conn.connectionState === "connected") setStatus("Ligado");
            };
            conn.onicecandidate = (e) =>
              e.candidate && l.send({ type: "ice", to: "host" as any, from: id, candidate: e.candidate.toJSON() });
            await conn.setRemoteDescription(s.sdp);
            await flushIce(conn);
            const answer = await conn.createAnswer();
            await conn.setLocalDescription(answer);
            l.send({ type: "answer", to: "host", from: id, sdp: conn.localDescription! });
          } else if (s.type === "ice" && pc) {
            await addIce(pc, s.candidate);
          }
        });
        if (cancelled) return l.close();
        link = l;
        setStatus("A pedir a transmissão…");
        l.send({ type: "viewer-join", from: id });
        // Se o transmissor não responder (mensagem perdida / ainda a arrancar), repete o pedido.
        retry = setInterval(() => {
          if (gotOffer) return;
          setStatus("A aguardar o transmissor…");
          l.send({ type: "viewer-join", from: id });
        }, 6000);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Erro ao ligar à transmissão.");
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(retry);
      link?.send({ type: "viewer-leave", from: id });
      link?.close();
      pc?.close();
    };
  }, [room]);

  return { stream, error, status };
}

/** Badge "AO VIVO": lê live_sessions e acompanha alterações em tempo real. */
export function useIsLive(room: string) {
  const [live, setLive] = useState(false);
  useEffect(() => {
    supabase.from("live_sessions").select("is_live").eq("room", room).single()
      .then(({ data }) => setLive(!!data?.is_live));
    const ch = supabase.channel(`status:${room}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_sessions", filter: `room=eq.${room}` },
        (p) => setLive(!!(p.new as any).is_live))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [room]);
  return live;
}
