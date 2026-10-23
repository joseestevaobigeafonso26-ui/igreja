"use client";
/**
 * WebRTC com sinalização via Supabase Realtime (canal broadcast "live:<sala>").
 * Topologia: o transmissor abre uma RTCPeerConnection por espectador (malha 1→N).
 * Funciona bem para dezenas de espectadores; para centenas seria preciso um SFU (servidor de vídeo). Aulas com cadeiras: ver src/lib/aula.
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

// Credenciais TURN vêm de /api/turn (servidor). Qualquer visitante pode pedir (sem sessão); guardadas 1 h.
let cachedCfg: { cfg: RTCConfiguration; at: number } | null = null;
export async function rtcConfig(): Promise<RTCConfiguration> {
  if (cachedCfg && Date.now() - cachedCfg.at < 3600_000) return cachedCfg.cfg;
  let extra: RTCIceServer[] = [];
  try {
    const { data } = await supabase.auth.getSession();
    const res = await fetch("/api/turn", data.session ? { headers: { Authorization: `Bearer ${data.session.access_token}` } } : undefined);
    if (res.ok) {
      const j = await res.json();
      if (Array.isArray(j.iceServers)) extra = j.iceServers;
    }
  } catch {}
  const cfg: RTCConfiguration = { iceServers: [...iceServers, ...extra] };
  if (extra.length) cachedCfg = { cfg, at: Date.now() }; // só guarda se o TURN respondeu
  return cfg;
}
/** Salas "cam-*" (câmara remota) são privadas: exigem sessão. As públicas não exigem nada. */
const isCam = (room: string) => room.startsWith("cam-");
async function prepare(room: string) {
  if (isCam(room)) await ensureSession();
  return rtcConfig();
}

// ── Assinatura das ofertas: só quem tem a chave privada da transmissão (a equipa) consegue
// gerar ofertas que os espectadores aceitam. A chave pública fica em live_sessions.pubkey.
const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (str: string) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
const offerMsg = (to: string, sdp: string) => `offer|${to}|${sdp}`;
type Signer = { pub: JsonWebKey; sign: (m: string) => Promise<string> };
async function newSigner(): Promise<Signer> {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
  const pub = await crypto.subtle.exportKey("jwk", kp.publicKey);
  return { pub, sign: async (m) => b64(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, enc.encode(m))) };
}
async function fetchRoomKey(room: string): Promise<CryptoKey | null> {
  const { data } = await supabase.from("live_sessions").select("pubkey").eq("room", room).single();
  if (!data?.pubkey) return null;
  try {
    return await crypto.subtle.importKey("jwk", data.pubkey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  } catch { return null; }
}
async function verifySig(key: CryptoKey | null, msg: string, sig?: string) {
  if (!key || !sig) return false;
  try { return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, unb64(sig), enc.encode(msg)); }
  catch { return false; }
}

type Signal =
  | { type: "viewer-join"; from: string }
  | { type: "viewer-leave"; from: string }
  | { type: "offer"; to: string; sdp: RTCSessionDescriptionInit; sig?: string }
  | { type: "answer"; to: "host"; from: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; to: string; from: string; candidate: RTCIceCandidateInit }
  | { type: "broadcaster-ready" }
  | { type: "broadcaster-stop"; sig?: string };

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
    if (error)
      throw new Error(
        `Não foi possível entrar como visitante (${error.message}). No Supabase, em Authentication → Sign In / Providers, deixe LIGADOS "Allow anonymous sign-ins" e "Allow new users to sign up".`
      );
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
  // O espectador só ESCREVE no canal "viewers" (não tem permissão de leitura), então envia por HTTP
  // (httpSend) sem entrar nele. O transmissor tem leitura e escrita e usa WebSocket.
  const restSend = side === "viewer";
  const sub = (ch: RealtimeChannel, topic: string) =>
    new Promise<void>((res, rej) =>
      ch.subscribe((st, err) => {
        if (st === "SUBSCRIBED") res();
        else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT")
          rej(new Error(`Sem permissão no canal "${topic}" (${err?.message ?? st}). Confirme que executou os schema_v4, v5 e v6 no Supabase.`));
      })
    );
  await Promise.all(restSend ? [sub(rx, rxTopic)] : [sub(rx, rxTopic), sub(tx, txTopic)]);
  return {
    send: (payload) => {
      if (restSend) tx.httpSend("signal", payload).catch((e) => console.warn("httpSend falhou:", e));
      else tx.send({ type: "broadcast", event: "signal", payload });
    },
    close: () => { supabase.removeChannel(rx); supabase.removeChannel(tx); },
  };
}

/** Canal PÚBLICO (sem sessão): qualquer visitante liga. A segurança vem da assinatura das ofertas. */
async function openPublicChannel(room: string, onSignal: (s: Signal) => void): Promise<Link> {
  supabase.getChannels().filter((c) => c.topic === `realtime:pub:${room}`).forEach((c) => supabase.removeChannel(c));
  const ch = supabase.channel(`pub:${room}`, { config: { broadcast: { self: false } } });
  ch.on("broadcast", { event: "signal" }, ({ payload }) => onSignal(payload as Signal));
  await new Promise<void>((res, rej) =>
    ch.subscribe((st, err) => {
      if (st === "SUBSCRIBED") res();
      else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT")
        rej(new Error(`Falha ao ligar ao canal da transmissão (${err?.message ?? st}).`));
    })
  );
  return {
    send: (payload) => { ch.send({ type: "broadcast", event: "signal", payload }); },
    close: () => { supabase.removeChannel(ch); },
  };
}

export type Source = "tela" | "camera";
export type CameraOpts = {
  facing?: "environment" | "user";          // traseira / frontal
  orientation?: "horizontal" | "vertical";  // imagem deitada (16:9) ou em pé (9:16)
};

/** Restrições de vídeo conforme as opções da câmara. */
export function videoConstraints(o: CameraOpts = {}): MediaTrackConstraints {
  const base: MediaTrackConstraints = { facingMode: o.facing ?? "environment" };
  if (o.orientation === "vertical") return { ...base, width: { ideal: 720 }, height: { ideal: 1280 }, aspectRatio: { ideal: 9 / 16 } };
  if (o.orientation === "horizontal") return { ...base, width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 16 / 9 } };
  return { ...base, width: { ideal: 1280 } };
}

// Microfone com cancelamento de eco, redução de ruído e ganho automático (ajuda contra retorno de som).
const AUDIO_CONSTRAINTS: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

/* ───────────── Transmissor (pastor / professor) ───────────── */
export function useBroadcaster(room: string) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [viewers, setViewers] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const chRef = useRef<Link | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const externalRef = useRef(false); // true quando a fonte é um stream recebido (câmara remota)
  const signerRef = useRef<Signer | null>(null);
  const camOpts = useRef<CameraOpts>({});

  const stop = useCallback(async () => {
    const sig = signerRef.current ? await signerRef.current.sign("stop") : undefined;
    chRef.current?.send({ type: "broadcaster-stop", sig });
    signerRef.current = null;
    peers.current.forEach((pc) => pc.close());
    peers.current.clear();
    if (!externalRef.current) streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    externalRef.current = false;
    chRef.current?.close();
    chRef.current = null;
    setStream(null);
    setViewers(0);
    await supabase.from("live_sessions").update({ is_live: false, pubkey: null }).eq("room", room);
  }, [room]);

  const start = useCallback(async (source: Source | MediaStream, opts?: CameraOpts) => {
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
            const mic = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
            mic.getAudioTracks().forEach((t) => media.addTrack(t));
          } catch {}
        }
      } else {
        camOpts.current = { facing: "environment", ...opts };
        media = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints(camOpts.current),
          audio: AUDIO_CONSTRAINTS,
        });
      }
      streamRef.current = media;
      setMicOn(true);
      const vt = media.getVideoTracks()[0];
      if (vt) vt.onended = () => stop(); // botão "Parar partilha" do navegador

      const cfg = await prepare(room);
      if (!isCam(room)) {
        const signer = await newSigner();
        const { error: e1 } = await supabase.from("live_sessions").update({ pubkey: signer.pub }).eq("room", room);
        if (e1) throw new Error(`Não foi possível registar a chave da transmissão — execute o schema_v7.sql no Supabase. (${e1.message})`);
        signerRef.current = signer;
      }
      let link: Link | undefined;
      const send = (p: Signal) => link?.send(p);
      const onSignal = async (s: Signal) => {
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
          const local = pc.localDescription!;
          const sig = signerRef.current ? await signerRef.current.sign(offerMsg(s.from, local.sdp)) : undefined;
          send({ type: "offer", to: s.from, sdp: local, sig });
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
      };
      link = isCam(room) ? await openChannel(room, "host", onSignal) : await openPublicChannel(room, onSignal);
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
  /** Liga/desliga o áudio que está a ser enviado (sem parar o vídeo). */
  const toggleMic = useCallback(() => {
    const tracks = streamRef.current?.getAudioTracks() ?? [];
    const on = tracks.some((t) => t.enabled);
    tracks.forEach((t) => (t.enabled = !on));
    setMicOn(!on);
  }, []);

  /**
   * Muda a câmara com a transmissão a decorrer (horizontal/vertical, frontal/traseira).
   * Os espectadores continuam ligados: só se troca a imagem enviada.
   */
  const setCamera = useCallback(async (next: CameraOpts) => {
    const media = streamRef.current;
    if (!media || externalRef.current) return;
    const old = media.getVideoTracks()[0];
    if (!old) return;
    const prev = camOpts.current;
    const merged: CameraOpts = { ...prev, ...next };
    setError(null);
    const refresh = () => setStream(new MediaStream(media.getTracks())); // força a pré-visualização a atualizar

    // 1) Só mudou a orientação: tenta ajustar a câmara que já está aberta.
    if (merged.facing === prev.facing) {
      try {
        await old.applyConstraints(videoConstraints(merged));
        camOpts.current = merged;
        refresh();
        return;
      } catch { /* este aparelho não deixa: reabre a câmara abaixo */ }
    }

    // 2) Reabre a câmara (obrigatório para frontal ↔ traseira) e troca a imagem em todos os espectadores.
    old.stop(); // muitos telemóveis só abrem uma câmara de cada vez
    const open = async (o: CameraOpts) =>
      (await navigator.mediaDevices.getUserMedia({ video: videoConstraints(o) })).getVideoTracks()[0];
    let track: MediaStreamTrack;
    let used = merged;
    try {
      track = await open(merged);
    } catch {
      try { track = await open(prev); used = prev; }
      catch (e: any) { setError("Não foi possível reabrir a câmara. Termine e inicie de novo."); return; }
      setError("Este aparelho não permitiu essa mudança de câmara.");
    }
    camOpts.current = used;
    media.removeTrack(old);
    media.addTrack(track);
    track.onended = () => stop();
    peers.current.forEach((pc) => {
      pc.getSenders().find((sd) => sd.track?.kind === "video")?.replaceTrack(track).catch(() => {});
    });
    refresh();
  }, [stop]);

  return { stream, viewers, error, start, stop, micOn, toggleMic, setCamera };
}

/* ───────────── Espectador (qualquer pessoa, sem conta) ───────────── */
export function useViewer(room: string) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("A preparar…");

  useEffect(() => {
    const id = crypto.randomUUID();
    const cam = isCam(room);
    let retry: ReturnType<typeof setInterval> | undefined;
    let gotOffer = false;
    let pc: RTCPeerConnection | null = null;
    let link: Link | undefined;
    let cancelled = false;
    let hostKey: CryptoKey | null = null;
    let earlyIce: RTCIceCandidateInit[] = []; // ICE que chega enquanto a oferta ainda é verificada

    (async () => {
      try {
        const cfg = await prepare(room);
        if (!cam) hostKey = await fetchRoomKey(room);
        const onSignal = async (s: Signal) => {
          if (s.type === "broadcaster-ready") {
            if (!cam) hostKey = await fetchRoomKey(room);
            gotOffer = false; setStatus("A pedir a transmissão…");
            return l.send({ type: "viewer-join", from: id });
          }
          if (s.type === "broadcaster-stop") {
            if (!cam && !(await verifySig(hostKey, "stop", s.sig))) return; // ignora "stop" forjado
            pc?.close(); pc = null; setStream(null); setStatus("Transmissão terminada."); return;
          }
          if (!("to" in s) || s.to !== id) return;

          if (s.type === "offer") {
            if (!cam) {
              const msg = offerMsg(id, s.sdp.sdp ?? "");
              let ok = await verifySig(hostKey, msg, s.sig);
              if (!ok) { hostKey = await fetchRoomKey(room); ok = await verifySig(hostKey, msg, s.sig); }
              if (!ok) return; // oferta não assinada pela equipa: ignorada
            }
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
            earlyIce.forEach((c) => addIce(conn, c)); earlyIce = [];
            await flushIce(conn);
            const answer = await conn.createAnswer();
            await conn.setLocalDescription(answer);
            l.send({ type: "answer", to: "host", from: id, sdp: conn.localDescription! });
          } else if (s.type === "ice") {
            if (pc) await addIce(pc, s.candidate); else earlyIce.push(s.candidate);
          }
        };
        const l: Link = cam ? await openChannel(room, "viewer", onSignal) : await openPublicChannel(room, onSignal);
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

/** Banner de informações (rodapé estilo telejornal): texto opcional preenchido pela equipa, atualizado em tempo real. */
export function useBanner(room: string) {
  const [banner, setBanner] = useState<{ texto: string; ativo: boolean }>({ texto: "", ativo: false });
  useEffect(() => {
    const apply = (r: any) => setBanner({ texto: (r?.banner ?? "").trim(), ativo: !!r?.banner_ativo });
    supabase.from("live_sessions").select("banner, banner_ativo").eq("room", room).single()
      .then(({ data }) => apply(data));
    const ch = supabase.channel(`banner:${room}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_sessions", filter: `room=eq.${room}` },
        (p) => apply(p.new))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [room]);
  return banner.ativo && banner.texto ? banner.texto : "";
}
