/**
 * Protocolo da aula ao vivo (sem servidor de vídeo).
 *
 * Topologia: o computador do PROFESSOR é a ponte.
 *   • Cada aluno tem uma ligação "descida" com o professor (o professor envia: a sua imagem + as cadeiras).
 *   • O aluno que tem a palavra (cadeira) abre também uma ligação "subida" (envia câmara/microfone ao professor).
 *   • O professor reencaminha a subida de cada cadeira para todos os outros alunos.
 *
 * Sinalização (só texto, via Supabase Realtime, canais privados):
 *   aula:<sala>:host        professor → turma   (só o professor escreve; membros leem)
 *   aula:<sala>:u:<uid>     aluno → professor   (só o próprio aluno escreve; só o professor lê)
 * O nome do canal do aluno leva o seu uid, e a política RLS obriga uid = auth.uid():
 * por isso o professor sabe com certeza QUEM enviou cada mensagem (ninguém finge ser outro aluno).
 */

export const MAX_SEATS = 4; // cadeiras simultâneas (cada uma custa upload ao professor × nº de alunos)
export const MAX_ALUNOS = 15; // ligações simultâneas ao professor
export const MAX_CHAT = 300;
export const REACTS = ["👍", "❤️", "🙏", "🙌", "😮"];

export type Modo = "aprovar" | "livre";
export type Person = { uid: string; nome: string };
export type LayoutEntry = { role: "host" | "seat"; uid?: string; nome: string };
export type ChatMsg = { id: string; uid: string; nome: string; texto: string; pergunta: boolean; host: boolean };

/** Estado da turma, emitido só pelo professor (fonte de verdade). */
export type ClassState = {
  seats: number;
  modo: Modo;
  seated: Person[];
  hands: Person[];
  muted: string[]; // uids silenciados pelo professor
  layout: Record<string, LayoutEntry>; // id do MediaStream → o que é
  alunos: number;
  hostNome: string;
  t: number;
};

export type HostMsg =
  | { t: "state"; state: ClassState }
  | { t: "offer"; to: string; sid: string; v: number; sdp: RTCSessionDescriptionInit } // ligação "descida"
  | { t: "up-answer"; to: string; sid: string; sdp: RTCSessionDescriptionInit } // resposta à "subida"
  | { t: "welcome"; to: string; sid: string; chat: ChatMsg[] }
  | { t: "chat"; msg: ChatMsg }
  | { t: "react"; k: string; from: string }
  | { t: "full"; to: string }
  | { t: "replaced"; to: string; sid: string }
  | { t: "kick"; to: string }
  | { t: "end" };

export type StudentMsg =
  | { t: "join"; sid: string; rebuild?: boolean } // rebuild: a minha ligação morreu, refaz-la
  | { t: "answer"; sid: string; v: number; sdp: RTCSessionDescriptionInit } // resposta à descida
  | { t: "up-offer"; sid: string; sdp: RTCSessionDescriptionInit }
  | { t: "up-stop"; sid: string }
  | { t: "hand"; sid: string; on: boolean }
  | { t: "take"; sid: string }
  | { t: "leave-seat"; sid: string }
  | { t: "chat"; sid: string; texto: string; pergunta: boolean }
  | { t: "react"; sid: string; k: string }
  | { t: "bye"; sid: string };

/** Canal do professor (lado do professor). */
export interface HostTransport {
  send(m: HostMsg): void;
  onStudent(cb: (uid: string, m: StudentMsg) => void): void;
  /** Passa a escutar também este aluno (inscrito depois da aula começar). */
  listen?(uid: string): void;
  close(): void;
}
/** Canal do aluno. */
export interface StudentTransport {
  send(m: StudentMsg): void;
  onHost(cb: (m: HostMsg) => void): void;
  close(): void;
}

// ───────── utilidades WebRTC partilhadas ─────────

/** Espera que o ICE reúna candidatos (envio sem "trickle": uma só mensagem por oferta/resposta, sem problemas de ordem). */
export function waitIce(pc: RTCPeerConnection, maxMs = 3000): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { clearTimeout(t); pc.removeEventListener("icegatheringstatechange", on); resolve(); };
    const on = () => { if (pc.iceGatheringState === "complete") done(); };
    const t = setTimeout(done, maxMs);
    pc.addEventListener("icegatheringstatechange", on);
  });
}

export const AUDIO_CONSTRAINTS: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

export const uuid = () =>
  (globalThis.crypto && "randomUUID" in globalThis.crypto)
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const cleanText = (s: unknown, max = MAX_CHAT) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
