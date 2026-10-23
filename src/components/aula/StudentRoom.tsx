"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { StudentEngine, StudentStatus } from "@/lib/aula/StudentEngine";
import { openStudentTransport } from "@/lib/aula/supabaseTransport";
import { rtcConfig } from "@/lib/rtc";
import ChatBox from "./ChatBox";
import { ReactionBar, ReactionLayer, useReactions } from "./Reactions";
import StreamTile from "./StreamTile";

const btn = "rounded-lg px-3 py-2 text-sm font-semibold";
const on = "bg-slate-800 text-white";
const off = "bg-white border border-slate-300";

const FINAL: Partial<Record<StudentStatus, string>> = {
  encerrada: "A aula terminou. Obrigado por participar!",
  cheia: "A aula está cheia neste momento (limite de alunos ligados ao professor). Tente daqui a pouco.",
  substituida: "Entrou na aula noutro separador ou aparelho. Esta janela ficou parada.",
  expulso: "O professor retirou-o da aula.",
};
const LIVE_LABEL: Record<string, string> = {
  esperando: "A aguardar o professor…", ligando: "A ligar ao professor…", ligado: "AO VIVO", "sem-sinal": "Sem sinal do professor…",
};

/** Lado do aluno: recebe a aula do professor; com cadeira, envia câmara e microfone ao professor. */
export default function StudentRoom({ salaId, nome, uid, onExit }: { salaId: number; nome: string; uid: string; onExit: () => void }) {
  const ref = useRef<StudentEngine | null>(null);
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);
  const react = useReactions();
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const [blocked, setBlocked] = useState(false);
  const onBlocked = useCallback(() => setBlocked(true), []);

  useEffect(() => {
    let cancelled = false;
    let e: StudentEngine | undefined;
    (async () => {
      try {
        const [rtc, tr] = await Promise.all([rtcConfig(), openStudentTransport(salaId, uid)]);
        if (cancelled) return tr.close();
        e = new StudentEngine({ transport: tr, rtc, uid, nome, onChange: bump, onReact: (k) => react.add(k) });
        ref.current = e;
        e.start();
        setReady(true);
      } catch (x: any) {
        if (!cancelled) setErr(x?.message ?? "Não foi possível ligar à aula.");
      }
    })();
    const bye = () => e?.leave();
    window.addEventListener("pagehide", bye);
    return () => { cancelled = true; window.removeEventListener("pagehide", bye); e?.leave(); ref.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salaId, uid]);

  const e = ref.current;
  if (err) return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <p className="text-sm text-red-600">{err}</p>
      <button onClick={onExit} className="text-sm text-slate-600 underline">Voltar</button>
    </div>
  );
  if (!ready || !e) return <p className="rounded-2xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm">A ligar…</p>;

  const final = FINAL[e.status];
  if (final) return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <p className="text-sm text-slate-700">{final}</p>
      <div className="flex justify-center gap-3">
        {e.status !== "expulso" && <button onClick={() => e.rejoin()} className="rounded-lg bg-brand-terracotta px-4 py-2 text-sm font-bold text-white">{e.status === "substituida" ? "Usar esta janela" : "Entrar de novo"}</button>}
        <button onClick={onExit} className="text-sm text-slate-600 underline">Sair</button>
      </div>
    </div>
  );

  const stage = e.stage();
  const st = e.state;
  const free = e.free;
  const seats = stage.seats;

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">{nome}</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-bold text-white ${e.status === "ligado" ? "badge-live bg-brand-terracotta" : "bg-slate-500"}`}>
          {e.status === "ligado" ? `● AO VIVO${st ? ` · ${st.alunos + 1} na sala` : ""}` : LIVE_LABEL[e.status]}
        </span>
      </div>
      {blocked && (
        <button onClick={() => { document.querySelectorAll("video").forEach((v) => v.play().catch(() => {})); setBlocked(false); }}
          className={`${btn} w-full bg-amber-400 text-slate-900`}>🔊 Toque aqui para ativar o som da aula</button>
      )}

      <div className="relative">
        <ReactionLayer parts={react.parts} />
        {stage.host ? <StreamTile stream={stage.host} nome={stage.hostNome} big onBlocked={onBlocked} /> : (
          <div className="flex aspect-video items-center justify-center rounded-xl bg-slate-900 p-6 text-center text-sm text-slate-400">
            {e.status === "esperando" ? "A aguardar o professor iniciar a aula…" : "A receber a imagem do professor…"}
          </div>
        )}
      </div>

      {st && (st.seats > 0 || seats.length > 0) && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold">🪑 Cadeiras ({seats.length}/{st.seats})</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {seats.map((s) => (
              <StreamTile key={s.uid} stream={s.stream} nome={s.me ? `${s.nome} (você)` : s.nome} silent={s.me} mirror={s.me}
                mutedByHost={st.muted.includes(s.uid)} micOff={s.me && !!s.stream && !e.micOn} status={s.me ? "câmara desligada" : "a ligar…"} onBlocked={onBlocked} />
            ))}
            {Array.from({ length: free }).map((_, i) => (
              <div key={i} className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-xs text-slate-400">🪑 livre</div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2 rounded-xl bg-slate-50 p-3">
        {e.iAmSeated ? (
          <>
            <p className="text-sm font-semibold">🪑 Tem a palavra. Ligue o que quiser: só você decide.</p>
            {e.mutedByHost && <p className="text-sm text-amber-800">🔇 O professor silenciou o seu microfone por agora.</p>}
            <div className="flex flex-wrap gap-2">
              {!e.local ? (
                <>
                  <button onClick={() => e.enableMedia("av")} className={`${btn} bg-brand-terracotta text-white`}>🎤📷 Ligar câmara e microfone</button>
                  <button onClick={() => e.enableMedia("audio")} className={`${btn} ${off}`}>🎤 Só microfone</button>
                </>
              ) : (
                <>
                  <button onClick={() => e.toggleMic()} className={`${btn} ${e.micOn ? on : off}`}>🎤 Microfone {e.micOn ? "ligado" : "desligado"}</button>
                  {e.hasCam && <button onClick={() => e.toggleCam()} className={`${btn} ${e.camOn ? on : off}`}>📷 Câmara {e.camOn ? "ligada" : "desligada"}</button>}
                </>
              )}
              <button onClick={() => e.leaveSeat()} className={`${btn} ${off} text-red-600`}>Devolver a palavra</button>
            </div>
            {e.local && <p className="text-xs text-slate-500">Use fones para não haver eco.</p>}
          </>
        ) : !st || st.seats === 0 ? (
          <p className="text-sm text-slate-500">Neste momento ninguém pode falar em vídeo. Pode participar no chat e com reações.</p>
        ) : free === 0 ? (
          <p className="text-sm text-slate-500">Todas as cadeiras estão ocupadas.</p>
        ) : st.modo === "livre" ? (
          <button onClick={() => e.take()} className={`${btn} bg-brand-terracotta text-white`}>🪑 Pedir a palavra ({free} livre{free > 1 ? "s" : ""})</button>
        ) : (
          <button onClick={() => e.hand(!e.myHand)} className={`${btn} ${e.myHand ? "bg-amber-400 text-slate-900" : "bg-brand-terracotta text-white"}`}>
            {e.myHand ? "✋ Pedido enviado — tocar para cancelar" : `✋ Pedir a palavra (${free} livre${free > 1 ? "s" : ""})`}
          </button>
        )}
        {e.error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{e.error}</p>}
      </div>

      <ReactionBar onReact={(k) => e.react(k)} />
      <ChatBox chat={e.chat} onSend={(t, q) => e.sendChat(t, q)} />
      <button onClick={onExit} className="text-sm text-slate-600 underline">Sair da aula</button>
    </div>
  );
}
