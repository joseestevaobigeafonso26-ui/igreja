"use client";
/** Reações, comentários e presença de uma sala. Uma única ligação alimenta todas as vistas (painel, camada sobre o vídeo, janela do pastor). */
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { useRole } from "./auth";

export type Msg = {
  id: number; room: string; nome: string; texto: string; tipo: "comentario" | "pergunta";
  autor_tipo: "visitante" | "membro" | "responsavel"; fixado: boolean; respondido: boolean; created_at: string;
};
export type Person = { nome: string; tipo: string };

export const REACTIONS = [
  { k: "gosto", e: "👍", l: "Gosto" },
  { k: "adoro", e: "❤️", l: "Adoro" },
  { k: "amem", e: "🙏", l: "Amém" },
  { k: "aleluia", e: "🙌", l: "Aleluia" },
  { k: "uau", e: "😮", l: "Uau" },
];

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };

/** Quem sou eu: chave do aparelho, nome (visitante) ou perfil (membro/equipa). */
export function useIdentity() {
  const { role, isStaff } = useRole();
  const [clientKey, setClientKey] = useState("");
  const [nome, setNomeState] = useState("");
  const [perfilNome, setPerfilNome] = useState<string | null>(null);

  useEffect(() => {
    let k = get("ck");
    if (!k) { k = crypto.randomUUID(); set("ck", k); }
    setClientKey(k);
    setNomeState(get("nome") ?? "");
  }, []);

  useEffect(() => {
    if (!role) { setPerfilNome(null); return; }
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("nome").eq("id", user.id).single();
      setPerfilNome(data?.nome ?? null);
    })();
  }, [role]);

  const setNome = (n: string) => { setNomeState(n); set("nome", n); };
  const logged = !!role;
  const display = logged ? perfilNome ?? "Membro" : nome.trim() || "Visitante";
  const tipo = isStaff ? "responsavel" : logged ? "membro" : "visitante";
  return { clientKey, nome, setNome, logged, isStaff, display, tipo };
}
export type Identity = ReturnType<typeof useIdentity>;

export function useLiveFeed(room: string, enabled: boolean, id: Identity, observer = false) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [recent, setRecent] = useState<Msg[]>([]); // últimas mensagens (somem após 15 s) para a camada sobre o vídeo
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [parts, setParts] = useState<{ id: number; e: string; x: number }[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const chRef = useRef<RealtimeChannel | null>(null);
  const joined = useRef(false);
  const last = useRef(0);
  const pid = useRef(0);
  const idRef = useRef(id);
  idRef.current = id;

  // Comentários: carrega os da transmissão atual e acompanha em tempo real
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setMsgs([]); setRecent([]);
    (async () => {
      const { data: s } = await supabase.from("live_sessions").select("started_at").eq("room", room).single();
      let q = supabase.from("live_comments").select("*").eq("room", room).order("id", { ascending: false }).limit(100);
      if (s?.started_at) q = q.gte("created_at", s.started_at);
      const { data } = await q;
      if (active && data) setMsgs((data as Msg[]).reverse());
    })();
    const ch = supabase.channel(`chat:${room}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_comments", filter: `room=eq.${room}` }, (p) => {
        const m = p.new as Msg;
        setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur.slice(-199), m]));
        setRecent((r) => [...r.slice(-4), m]);
        setTimeout(() => setRecent((r) => r.filter((x) => x.id !== m.id)), 15000);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_comments", filter: `room=eq.${room}` },
        (p) => setMsgs((cur) => cur.map((x) => (x.id === (p.new as Msg).id ? (p.new as Msg) : x))))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "live_comments" }, (p) => {
        const gone = (p.old as { id: number }).id;
        setMsgs((cur) => cur.filter((x) => x.id !== gone));
        setRecent((r) => r.filter((x) => x.id !== gone));
      })
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [room, enabled]);

  // Reações (broadcast) + quem está a assistir (presença)
  useEffect(() => {
    if (!enabled || !id.clientKey) return;
    setCounts({});
    supabase.getChannels().filter((c) => c.topic === `realtime:rx:${room}`).forEach((c) => supabase.removeChannel(c));
    const ch = supabase.channel(`rx:${room}`, { config: { broadcast: { self: true }, presence: { key: id.clientKey } } });
    ch.on("broadcast", { event: "react" }, ({ payload }) => {
      const r = REACTIONS.find((x) => x.k === payload?.k);
      if (!r) return;
      setCounts((c) => ({ ...c, [r.k]: (c[r.k] ?? 0) + 1 }));
      const pidn = ++pid.current;
      setParts((p) => [...p.slice(-25), { id: pidn, e: r.e, x: 8 + Math.random() * 70 }]);
      setTimeout(() => setParts((p) => p.filter((i) => i.id !== pidn)), 2500);
    });
    ch.on("presence", { event: "sync" }, () => {
      const st = ch.presenceState<Person>();
      setPeople(Object.values(st).map((v) => v[0]).filter(Boolean));
    });
    ch.subscribe((s) => {
      if (s === "SUBSCRIBED") {
        joined.current = true;
        if (!observer) ch.track({ nome: idRef.current.display, tipo: idRef.current.tipo });
      }
    });
    chRef.current = ch;
    return () => { joined.current = false; supabase.removeChannel(ch); chRef.current = null; };
  }, [room, enabled, id.clientKey, observer]);

  useEffect(() => {
    if (!observer && joined.current) chRef.current?.track({ nome: id.display, tipo: id.tipo });
  }, [id.display, id.tipo, observer]);

  const react = useCallback((k: string) => {
    const now = Date.now();
    if (now - last.current < 400) return; // evita rajadas de cliques
    last.current = now;
    chRef.current?.send({ type: "broadcast", event: "react", payload: { k } });
  }, []);

  /** Devolve null se correu bem, ou a mensagem de erro. */
  const send = useCallback(async (texto: string, nome: string, pergunta: boolean) => {
    const { error } = await supabase.from("live_comments").insert({
      room, nome: (nome.trim() || "Visitante").slice(0, 40), texto: texto.trim().slice(0, 300),
      tipo: pergunta ? "pergunta" : "comentario", client_key: idRef.current.clientKey,
    });
    if (!error) return null;
    return error.message.includes("row-level security") ? "Os comentários só estão abertos durante a transmissão." : error.message;
  }, [room]);

  const upd = useCallback((mid: number, patch: Partial<Msg>) => supabase.from("live_comments").update(patch).eq("id", mid), []);
  const del = useCallback((mid: number) => supabase.from("live_comments").delete().eq("id", mid), []);

  return { msgs, recent, counts, parts, people, react, send, upd, del };
}
export type Feed = ReturnType<typeof useLiveFeed>;
