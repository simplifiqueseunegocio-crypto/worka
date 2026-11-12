import Link from "next/link";
import { TransicaoPagina } from "@/components/ui/transicao";

export function EmConstrucao({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <TransicaoPagina>
      <main className="entrada mx-auto flex min-h-[70vh] max-w-xl flex-col items-start justify-center gap-4 px-4 py-16 sm:px-8">
        <p className="text-xs font-semibold tracking-[0.2em] text-texto-suave">EM CONSTRUÇÃO</p>
        <h1 className="font-display text-4xl leading-[1.1] text-texto">{titulo}</h1>
        <p className="text-base leading-relaxed text-texto-suave">{descricao}</p>
        <Link
          href="/"
          className="mt-2 flex h-11 items-center rounded-full bg-primaria px-6 text-sm font-bold text-sobre-primaria hover:bg-primaria-hover"
        >
          Voltar ao início
        </Link>
      </main>
    </TransicaoPagina>
  );
}
