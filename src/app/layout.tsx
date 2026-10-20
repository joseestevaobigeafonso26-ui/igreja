import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Nav from "@/components/Nav";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
export const metadata: Metadata = {
  title: "Igreja Comunitária Batista do Vale do Quixicongo",
  description: "Uma Igreja Voltada ao Discipulado",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT">
      <body className={`${inter.className} min-h-screen bg-slate-100 text-slate-800`}>
        <Nav />
        <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
