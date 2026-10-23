"use client";
/**
 * Liga os motores da aula ao Supabase Realtime (canais privados de broadcast). Só texto: o vídeo nunca passa por aqui.
 *   aula:<sala>:host       professor → turma
 *   aula:<sala>:u:<uid>    aluno → professor (o uid vem do nome do canal e a política RLS obriga uid = auth.uid())
 */
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { HostMsg, HostTransport, Person, StudentMsg, StudentTransport } from "./protocol";

const EVT = "m";
const cfg = { config: { private: true, broadcast: { self: false } } };
const HELP = "Confirme que executou o supabase/schema_v11.sql no Supabase.";

async function authed() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("A sessão terminou. Entre outra vez.");
  await supabase.realtime.setAuth();
}
function fresh(topic: string) {
  supabase.getChannels().filter((c) => c.topic === `realtime:${topic}`).forEach((c) => supabase.removeChannel(c));
}
function join(ch: RealtimeChannel, topic: string) {
  return new Promise<void>((res, rej) =>
    ch.subscribe((st, err) => {
      if (st === "SUBSCRIBED") res();
      else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT")
        rej(new Error(`Sem permissão no canal da aula "${topic}" (${err?.message ?? st}). ${HELP}`));
    })
  );
}

/** Professor: escreve em :host (pela ligação WebSocket) e escuta o canal de cada aluno inscrito. */
export async function openHostTransport(salaId: number, roster: Person[], onWarn?: (m: string) => void): Promise<HostTransport> {
  await authed();
  const topic = `aula:${salaId}:host`;
  fresh(topic);
  const hostCh = supabase.channel(topic, cfg);
  await join(hostCh, topic);

  let cb: ((uid: string, m: StudentMsg) => void) | undefined;
  const chans = new Map<string, RealtimeChannel>();
  const listen = (uid: string) => {
    if (chans.has(uid)) return;
    const t = `aula:${salaId}:u:${uid}`;
    fresh(t);
    const ch = supabase.channel(t, cfg);
    ch.on("broadcast", { event: EVT }, ({ payload }) => cb?.(uid, payload as StudentMsg));
    ch.subscribe((st, err) => {
      if (st === "CHANNEL_ERROR" || st === "TIMED_OUT") onWarn?.(`Não consegui ouvir um aluno (${err?.message ?? st}). ${HELP}`);
    });
    chans.set(uid, ch);
  };
  roster.forEach((p) => listen(p.uid));

  // Fila com espaçamento: no arranque o professor envia muitas mensagens de uma vez (uma oferta por aluno).
  const queue: HostMsg[] = [];
  let busy = false;
  const pump = () => {
    if (busy) return;
    busy = true;
    const step = () => {
      const m = queue.shift();
      if (!m) { busy = false; return; }
      hostCh.send({ type: "broadcast", event: EVT, payload: m });
      setTimeout(step, 25);
    };
    step();
  };

  return {
    send: (m) => { queue.push(m); pump(); },
    onStudent: (f) => { cb = f; },
    listen,
    close: () => {
      queue.length = 0;
      supabase.removeChannel(hostCh);
      chans.forEach((c) => supabase.removeChannel(c));
      chans.clear();
    },
  };
}

/** Aluno: escuta :host e escreve no seu próprio canal por HTTP (não precisa de permissão de leitura nele). */
export async function openStudentTransport(salaId: number, uid: string): Promise<StudentTransport> {
  await authed();
  const rxTopic = `aula:${salaId}:host`;
  const txTopic = `aula:${salaId}:u:${uid}`;
  fresh(rxTopic); fresh(txTopic);
  const rx = supabase.channel(rxTopic, cfg);
  let cb: ((m: HostMsg) => void) | undefined;
  rx.on("broadcast", { event: EVT }, ({ payload }) => cb?.(payload as HostMsg));
  await join(rx, rxTopic);
  const tx = supabase.channel(txTopic, cfg);
  return {
    send: (m) => { tx.httpSend(EVT, m).catch((e) => console.warn("Aula: envio falhou", e)); },
    onHost: (f) => { cb = f; },
    close: () => { supabase.removeChannel(rx); supabase.removeChannel(tx); },
  };
}
