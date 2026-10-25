"use client";
import { useEffect, useState } from "react";

/** Botão "Instalar aplicação". Android/computador: abre o pedido de instalação. iPhone e outros: mostra o passo a passo. */
export default function InstallApp({ className = "" }: { className?: string }) {
  const [evt, setEvt] = useState<any>(null);
  const [instalado, setInstalado] = useState(false);
  const [movel, setMovel] = useState(false);
  const [ios, setIos] = useState(false);
  const [ajuda, setAjuda] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
    setInstalado(standalone);
    const ua = navigator.userAgent;
    setIos(/iphone|ipad|ipod/i.test(ua));
    setMovel(/android|iphone|ipad|ipod/i.test(ua));
    const antes = (e: Event) => { e.preventDefault(); setEvt(e); };
    const depois = () => { setInstalado(true); setEvt(null); };
    window.addEventListener("beforeinstallprompt", antes);
    window.addEventListener("appinstalled", depois);
    return () => { window.removeEventListener("beforeinstallprompt", antes); window.removeEventListener("appinstalled", depois); };
  }, []);

  if (instalado || (!evt && !movel)) return null;

  async function instalar() {
    if (evt) { evt.prompt(); await evt.userChoice.catch(() => {}); setEvt(null); }
    else setAjuda(true);
  }

  return (
    <>
      <button onClick={instalar} type="button" className={`rounded-lg bg-amber-400 px-3 py-2 text-sm font-bold text-slate-900 ${className}`}>
        📲 Instalar aplicação
      </button>
      {ajuda && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={() => setAjuda(false)}>
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 text-slate-800 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">Instalar no telemóvel</h2>
            {ios ? (
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                <li>Abra este site no <b>Safari</b>.</li>
                <li>Toque no botão <b>Partilhar</b> (quadrado com seta para cima).</li>
                <li>Escolha <b>Adicionar ao ecrã principal</b>.</li>
                <li>Toque em <b>Adicionar</b>.</li>
              </ol>
            ) : (
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                <li>Abra o menu do navegador (<b>⋮</b> ou <b>⋯</b>).</li>
                <li>Escolha <b>Instalar aplicação</b> ou <b>Adicionar ao ecrã principal</b>.</li>
                <li>Confirme. O ícone da igreja aparece no seu telemóvel.</li>
              </ol>
            )}
            <button onClick={() => setAjuda(false)} className="w-full rounded-lg bg-brand-terracotta py-2 font-bold text-white">Entendi</button>
          </div>
        </div>
      )}
    </>
  );
}
