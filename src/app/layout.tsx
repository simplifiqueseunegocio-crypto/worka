import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";
import { SCRIPT_TEMA } from "@/lib/tema";
import "./globals.css";

// Inter: textos, tabelas, formulários e menus.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Sora SemiBold: marca e títulos principais.
const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["600"],
});

export const metadata: Metadata = {
  title: {
    default: "Worka",
    template: "%s · Worka",
  },
  description: "Worka: automação e gestão operacional para escritórios de contabilidade. Menos rotina. Mais resultado.",
  applicationName: "Worka",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF8EF" },
    { media: "(prefers-color-scheme: dark)", color: "#242322" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: o script abaixo põe a classe "dark" antes da hidratação.
    <html lang="pt-BR" className={`${inter.variable} ${sora.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
