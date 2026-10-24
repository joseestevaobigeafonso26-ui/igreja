"use client";
import { useState } from "react";
import { useBanner, useBroadcaster, useIsLive, useVerse, useViewer, type CameraOpts, type Source } from "@/lib/rtc";
import CameraControls from "@/components/CameraControls";
import { useRole } from "@/lib/auth";
import Interaction from "@/components/Interaction";
import FeedOverlay from "@/components/FeedOverlay";
import BannerTicker from "@/components/BannerTicker";
import BannerEditor from "@/components/BannerEditor";
import VerseOverlay from "@/components/VerseOverlay";
import VerseControl from "@/components/VerseControl";
import VideoFrame, { Video } from "@/components/VideoFrame";

export { Video }; // compatibilidade: outros ficheiros importavam daqui
import { useIdentity, useLiveFeed, type Feed } from "@/lib/liveFeed";

function Viewer({ room }: { room: string }) {
  const { stream, error, status } = useViewer(room);
  const live = useIsLive(room);
  const banner = useBanner(room);
  const verso = useVerse(room);
  const [som, setSom] = useState(false); // começa sem som: evita eco entre telemóveis na mesma sala

  return (
    <div className="space-y-2">
      <VideoFrame stream={stream} muted={!som} controls onMutedChange={(m) => setSom(!m)}
        placeholder={
          <div className="flex aspect-video h-full w-full items-center justify-center p-6 text-center text-sm text-slate-400">
            {error ?? (live ? status : "Sem transmissão neste momento. Quando começar, o vídeo aparece aqui automaticamente.")}
          </div>
        }>
        {live && <VerseOverlay verso={verso} lift={banner ? 84 : 52} />}
        {live && <BannerTicker texto={banner} lift={44} />}
      </VideoFrame>
      {stream && (
        <div className="space-y-1">
          <button onClick={() => setSom(!som)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${som ? "bg-slate-200 text-slate-800" : "bg-brand-terracotta text-white"}`}>
            {som ? "🔊 Som ligado — tocar para silenciar" : "🔇 Sem som — tocar para ativar"}
          </button>
          <p className="text-xs text-slate-500">
            Está na igreja ou perto de outros telemóveis? Deixe sem som ou use fones: vários aparelhos com o mesmo áudio por perto causam eco.
          </p>
        </div>
      )}
    </div>
  );
}

function Broadcaster({ room, feed }: { room: string; feed: Feed }) {
  const { stream, viewers, error, start, stop, micOn, toggleMic, setCamera } = useBroadcaster(room);
  const banner = useBanner(room);
  const verso = useVerse(room);
  const [source, setSource] = useState<Source>("tela");
  const [cam, setCam] = useState<Required<CameraOpts>>({ orientation: "horizontal", facing: "environment" });
  const [iniciou, setIniciou] = useState<Source>("tela"); // fonte realmente em uso
  const usaCamara = (stream ? iniciou : source) === "camera";
  function mudarCamara(v: Required<CameraOpts>) { setCam(v); if (stream && iniciou === "camera") setCamera(v); }
  return (
    <div className="space-y-3">
      <VideoFrame stream={stream} muted
        placeholder={
          <div className="flex aspect-video h-full w-full items-center justify-center p-6 text-center text-sm text-slate-400">
            Escolha a fonte e clique em iniciar. A sua pré-visualização aparece aqui.
          </div>
        }>
        <VerseOverlay verso={verso} lift={banner ? 40 : 8} />
        <FeedOverlay feed={feed} lift={!!banner} />
        <BannerTicker texto={banner} />
      </VideoFrame>
      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {usaCamara && <CameraControls value={cam} onChange={mudarCamara} />}
      <div className="flex flex-wrap items-center gap-2">
        {!stream ? (
          <>
            <select value={source} onChange={(e) => setSource(e.target.value as Source)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="tela">Partilhar ecrã (computador)</option>
              <option value="camera">Câmara + microfone (telemóvel/altar)</option>
            </select>
            <button onClick={() => { setIniciou(source); start(source, cam); }}
              className="rounded-lg bg-brand-terracotta px-4 py-2 text-sm font-bold text-white hover:bg-brand-terracotta-dark">
              Iniciar transmissão
            </button>
          </>
        ) : (
          <>
            <button onClick={stop} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white">
              Terminar transmissão
            </button>
            <button onClick={toggleMic}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${micOn ? "bg-slate-200 text-slate-800" : "bg-red-600 text-white"}`}>
              {micOn ? "🎤 Som a ser enviado" : "🔇 Som silenciado"}
            </button>
            <span className="text-sm text-slate-600">{viewers} espectador(es) ligado(s)</span>
            <button onClick={() => window.open(`/painel/${room}`, "painel-" + room, "width=480,height=820")}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
              Abrir painel de comentários (outra janela/ecrã)
            </button>
          </>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Contra eco: use fones ou microfone de lapela, mantenha este aparelho longe das colunas e dos telemóveis de quem assiste, e silencie o som quando não estiver a falar.
      </p>
      <BannerEditor room={room} compact />
      <VerseControl room={room} />
    </div>
  );
}

export default function LiveRoom({ room, title, mode = "simples" }: { room: string; title: string; mode?: "simples" | "interativo" }) {
  const { isStaff, loading } = useRole();
  const live = useIsLive(room);
  const id = useIdentity();
  const feed = useLiveFeed(room, live && !loading, id);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold text-slate-800">{title}</h2>
        {live && (
          <span className="badge-live rounded-full bg-brand-terracotta px-3 py-1 text-xs font-bold text-white">● AO VIVO</span>
        )}
      </div>
      {loading ? null : isStaff ? <Broadcaster room={room} feed={feed} /> : <Viewer room={room} />}
      {live && !loading && <Interaction mode={mode} feed={feed} id={id} />}
    </section>
  );
}
