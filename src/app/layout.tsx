import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Nav from "@/components/Nav";
import PwaRegister from "@/components/PwaRegister";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const site =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: "Igreja Comunitária Batista do Vale do Quixicongo",
  description: "Uma Igreja Voltada ao Discipulado — culto ao vivo, discipulado, teologia e agenda.",
  applicationName: "Quixicongo",
  appleWebApp: { capable: true, title: "Quixicongo", statusBarStyle: "black-translucent" },
  openGraph: {
    title: "Igreja Comunitária Batista do Vale do Quixicongo",
    description: "Uma Igreja Voltada ao Discipulado",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
    locale: "pt_PT",
    type: "website",
  },
};

export const viewport: Viewport = { themeColor: "#18181b" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT">
      <body className={`${inter.className} min-h-screen bg-slate-100 text-slate-800`}>
        <Nav />
        <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">{children}</main>
        <PwaRegister />
      </body>
    </html>
  );
}
