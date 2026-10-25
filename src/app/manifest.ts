import type { MetadataRoute } from "next";

/** Torna o site instalável no telemóvel como aplicação ("Instalar aplicação" / "Adicionar ao ecrã principal"). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Igreja Comunitária Batista do Vale do Quixicongo",
    short_name: "Quixicongo",
    description: "Uma Igreja Voltada ao Discipulado — culto ao vivo, discipulado, teologia e agenda.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    lang: "pt-PT",
    background_color: "#ffffff",
    theme_color: "#18181b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Culto ao vivo", url: "/culto", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Agenda", url: "/agenda", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
