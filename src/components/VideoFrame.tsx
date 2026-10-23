"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

/** <video> ligado a um MediaStream. Avisa (`onSize`) quando a imagem muda de tamanho/orientação. */
export function Video({ stream, muted, controls, onMutedChange, onSize }:
  { stream: MediaStream | null; muted?: boolean; controls?: boolean; onMutedChange?: (m: boolean) => void; onSize?: (w: number, h: number) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const sizeCb = useRef(onSize);
  sizeCb.current = onSize;
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  useEffect(() => { if (ref.current) ref.current.muted = !!muted; }, [muted]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => { if (el.videoWidth) sizeCb.current?.(el.videoWidth, el.videoHeight); };
    el.addEventListener("loadedmetadata", report);
    el.addEventListener("resize", report); // o telemóvel rodou: a imagem passa de horizontal a vertical
    report();
    return () => { el.removeEventListener("loadedmetadata", report); el.removeEventListener("resize", report); };
  }, [stream]);
  return (
    <video ref={ref} autoPlay playsInline muted={muted} controls={controls ?? !muted}
      // O botão de ecrã inteiro nativo só abre o vídeo (sem banner/reações): usamos o nosso.
      controlsList="nofullscreen" disablePictureInPicture={false}
      onVolumeChange={(e) => onMutedChange?.(e.currentTarget.muted)} className="h-full w-full object-contain" />
  );
}

/** Ecrã inteiro de um elemento (com as camadas por cima: banner, reações…). Funciona em Android, desktop e iPad;
 *  no iPhone, que não permite ecrã inteiro de elementos, abre só o vídeo. Bloqueia a rotação do ecrã conforme o vídeo. */
export function useFullscreen(boxRef: RefObject<HTMLElement | null>) {
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const on = () => {
      const d: any = document;
      const el = d.fullscreenElement ?? d.webkitFullscreenElement;
      setIsFs(!!el && el === boxRef.current);
      if (!el) { try { (screen.orientation as any)?.unlock?.(); } catch {} }
    };
    document.addEventListener("fullscreenchange", on);
    document.addEventListener("webkitfullscreenchange", on);
    return () => {
      document.removeEventListener("fullscreenchange", on);
      document.removeEventListener("webkitfullscreenchange", on);
    };
  }, [boxRef]);

  const toggle = useCallback(async (lock?: "landscape" | "portrait") => {
    const el: any = boxRef.current;
    const d: any = document;
    if (!el) return;
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      (d.exitFullscreen ?? d.webkitExitFullscreen)?.call(d);
      return;
    }
    const videoOnly = () => (el.querySelector("video") as any)?.webkitEnterFullscreen?.(); // iPhone
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      else return videoOnly();
      if (lock) { try { await (screen.orientation as any)?.lock?.(lock); } catch {} }
    } catch {
      videoOnly();
    }
  }, [boxRef]);

  return { isFs, toggle };
}

/** Botão ⛶ / ✕ para ecrã inteiro. */
export function FullscreenButton({ isFs, onClick, className = "" }: { isFs: boolean; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} title={isFs ? "Sair do ecrã inteiro" : "Abrir em ecrã inteiro"}
      aria-label={isFs ? "Sair do ecrã inteiro" : "Abrir em ecrã inteiro"}
      className={`z-10 flex h-9 w-9 items-center justify-center rounded-lg bg-black/55 text-lg text-white ${className}`}>
      {isFs ? "✕" : "⛶"}
    </button>
  );
}

/**
 * Vídeo que acompanha a forma da imagem: horizontal (16:9) ou vertical (9:16) conforme o que a câmara envia.
 * Tem botão de ecrã inteiro; `children` (banner, reações) ficam por cima e também aparecem em ecrã inteiro.
 */
export default function VideoFrame({
  stream, muted, controls, onMutedChange, children, placeholder, maxVh = 75, className = "",
}: {
  stream: MediaStream | null;
  muted?: boolean;
  controls?: boolean;
  onMutedChange?: (m: boolean) => void;
  children?: ReactNode;
  placeholder?: ReactNode;
  maxVh?: number; // altura máxima em % do ecrã (evita um vídeo vertical enorme)
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const { isFs, toggle } = useFullscreen(box);

  useEffect(() => { if (!stream) setSize(null); }, [stream]);

  const ratio = stream && size ? size.w / size.h : 16 / 9;
  return (
    <div ref={box}
      className={`fs-box relative mx-auto w-full overflow-hidden rounded-xl bg-black ${className}`}
      style={{ aspectRatio: String(ratio), maxHeight: `${maxVh}vh`, maxWidth: `${maxVh * ratio}vh` }}>
      {stream ? (
        <>
          <Video stream={stream} muted={muted} controls={controls} onMutedChange={onMutedChange}
            onSize={(w, h) => setSize((s) => (s && s.w === w && s.h === h ? s : { w, h }))} />
          {children}
          <FullscreenButton isFs={isFs} className="absolute right-2 top-2"
            onClick={() => toggle(ratio < 1 ? "portrait" : "landscape")} />
        </>
      ) : placeholder}
    </div>
  );
}
