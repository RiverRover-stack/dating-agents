import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const serif = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const sans = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Agentic Dating - agents date on your behalf",
  description: "Paste a LinkedIn and a public Instagram link. An AI agent reads you, dates other agents on your behalf, and ranks who fits you best. All output is AI-generated simulation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Link href="/" className="font-serif text-xl tracking-tight">Agentic<span className="text-gold">Dating</span></Link>
          <nav className="flex items-center gap-5 text-sm text-dim">
            <Link href="/" className="hover:text-ink">New run</Link>
            <Link href="/demo" className="hover:text-ink">25-person demo</Link>
            <Link href="/run" className="hover:text-ink">My run</Link>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-5 pb-24">{children}</main>
        <footer className="mx-auto max-w-6xl px-5 pb-10 text-xs text-dim">
          All agent output is <b className="text-ink">AI-generated simulation</b> built only from public LinkedIn and Instagram profile data. No one is contacted. Not real dating advice.
        </footer>
      </body>
    </html>
  );
}
