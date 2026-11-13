import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  AlarmClock,
  ArrowLeftRight,
  Barcode,
  ArrowUpRight,
  BellRing,
  Bot,
  CalendarClock,
  Cog,
  FileCheck2,
  FileSearch,
  GitCompareArrows,
  HandCoins,
  Hourglass,
  IdCard,
  Inbox,
  Landmark,
  ListChecks,
  Lock,
  Mail,
  Mailbox,
  MessageSquareText,
  Receipt,
  ReceiptText,
  RefreshCw,
  ScanLine,
  ScrollText,
  Send,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Sunrise,
  Tags,
  type LucideIcon,
} from "lucide-react";
import { getUsuario } from "@/lib/auth";
import { automacoesPlanejadas, listarRotinas, type Rotina, type SaudeRotina } from "@/lib/automacoes";
import { FUSO } from "@/lib/log-sincronizacao";
import { Esqueleto, Revelar, TransicaoPagina } from "@/components/ui/transicao";
import { BotaoPreviaResumo } from "@/components/automacoes/botao-previa-resumo";
import { BuscaAutomacoes } from "./busca";

export const metadata: Metadata = { title: "Automações" };

type Busca = PageProps<"/automacoes">["searchParams"];

// Minúsculas e sem acentos, para "certidao" achar "Certidões".
const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

function combina(termo: string, ...campos: (string | null)[]) {
  if (!termo) return true;
  const texto = normalizar(campos.filter(Boolean).join(" "));
  return normalizar(termo)
    .split(/\s+/)
    .every((palavra) => texto.includes(palavra));
}

export default function Automacoes({ searchParams }: PageProps<"/automacoes">) {
  return (
    <TransicaoPagina>
      <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-8">
        <p className="text-xs font-semibold tracking-[0.2em] text-texto-suave">PLATAFORMA</p>
        <h1 className="mt-3 font-display text-3xl leading-[1.1] text-texto sm:text-[2.5rem]">Automações</h1>
        <p className="mt-3 max-w-2xl text-sm text-texto-suave">
          Rotinas que rodam sozinhas: quando rodam, o que fizeram na última vez e quando é a próxima.
        </p>

        <Suspense
          fallback={
            <Esqueleto>
              <Carregando />
            </Esqueleto>
          }
        >
          <Revelar>
            <Conteudo searchParams={searchParams} />
          </Revelar>
        </Suspense>
      </main>
    </TransicaoPagina>
  );
}

// ---------------------------------------------------------------------------

// Estado de execução: chip com fundo suave + ponto, cor semântica por estado.
const estilos: Record<SaudeRotina, { rotulo: string; texto: string; ponto: string; chip: string }> = {
  ok: { rotulo: "Funcionando", texto: "text-sucesso", ponto: "bg-sucesso-ponto", chip: "bg-sucesso-suave" },
  atencao: { rotulo: "Atenção", texto: "text-alerta", ponto: "bg-alerta-ponto", chip: "bg-alerta-suave" },
  sem_registro: { rotulo: "Sem registro", texto: "text-texto-suave", ponto: "bg-texto-suave/40", chip: "bg-suave" },
  restrito: { rotulo: "Restrito", texto: "text-texto-suave", ponto: "bg-texto-suave/40", chip: "bg-suave" },
};

// Identidade de cada automação no cartão: ícone, área e cor.
// "realce": a cor que o ícone cinza do "Em breve" ganha ao passar o mouse
// (escrita por inteiro para o Tailwind gerar a classe).
type Tom = { cor: string; fundo: string; anel: string; realce: string };
const TONS = {
  azul: { cor: "text-info", fundo: "bg-info-suave", anel: "hover:ring-info/30", realce: "group-hover:text-info group-hover:bg-info-suave" },
  verde: { cor: "text-sucesso", fundo: "bg-sucesso-suave", anel: "hover:ring-sucesso/30", realce: "group-hover:text-sucesso group-hover:bg-sucesso-suave" },
  ambar: { cor: "text-alerta", fundo: "bg-alerta-suave", anel: "hover:ring-alerta/30", realce: "group-hover:text-alerta group-hover:bg-alerta-suave" },
  vermelho: { cor: "text-perigo", fundo: "bg-perigo-suave", anel: "hover:ring-perigo/30", realce: "group-hover:text-perigo group-hover:bg-perigo-suave" },
  violeta: { cor: "text-violeta", fundo: "bg-violeta-suave", anel: "hover:ring-violeta/30", realce: "group-hover:text-violeta group-hover:bg-violeta-suave" },
  teal: { cor: "text-petroleo", fundo: "bg-petroleo-suave", anel: "hover:ring-petroleo/30", realce: "group-hover:text-petroleo group-hover:bg-petroleo-suave" },
  rosa: { cor: "text-rosa", fundo: "bg-rosa-suave", anel: "hover:ring-rosa/30", realce: "group-hover:text-rosa group-hover:bg-rosa-suave" },
  marca: { cor: "text-destaque", fundo: "bg-primaria-suave", anel: "hover:ring-primaria/30", realce: "group-hover:text-destaque group-hover:bg-primaria-suave" },
} satisfies Record<string, Tom>;

type Visual = { icone: LucideIcon; area: string; departamento: string; tom: Tom };
const VISUAL: Record<string, Visual> = {
  "robo-det": { icone: Bot, area: "Robô", departamento: "Pessoal", tom: TONS.marca },
  "leitura-ponto": { icone: ScanLine, area: "IA", departamento: "Pessoal", tom: TONS.violeta },
  adiantamento: { icone: HandCoins, area: "E-mail", departamento: "Pessoal", tom: TONS.teal },
  "resumo-diario": { icone: Sunrise, area: "E-mail", departamento: "Geral", tom: TONS.azul },
  "alertas-cnd": { icone: BellRing, area: "E-mail", departamento: "Fiscal", tom: TONS.ambar },
  "atrasos-gestor": { icone: AlarmClock, area: "E-mail", departamento: "Geral", tom: TONS.vermelho },
  "cnd-vencendo": { icone: CalendarClock, area: "E-mail", departamento: "Fiscal", tom: TONS.ambar },
  "cobranca-cliente": { icone: Send, area: "E-mail", departamento: "Geral", tom: TONS.rosa },
  "conferencia-receita": { icone: Landmark, area: "Receita", departamento: "Societário", tom: TONS.azul },
  "conta-azul": { icone: RefreshCw, area: "Integração", departamento: "Geral", tom: TONS.teal },
  tarefas: { icone: ListChecks, area: "Tarefas", departamento: "Geral", tom: TONS.violeta },
  "cnd-rodada": { icone: ShieldCheck, area: "Certidões", departamento: "Fiscal", tom: TONS.verde },
  "cnd-consultas": { icone: FileSearch, area: "Certidões", departamento: "Fiscal", tom: TONS.verde },
  // Em breve
  "triagem-entrada": { icone: Inbox, area: "IA", departamento: "Geral", tom: TONS.violeta },
  "leitor-atestados": { icone: Stethoscope, area: "IA", departamento: "Pessoal", tom: TONS.violeta },
  "leitor-admissao": { icone: IdCard, area: "IA", departamento: "Pessoal", tom: TONS.violeta },
  "conferencia-folha": { icone: GitCompareArrows, area: "IA", departamento: "Pessoal", tom: TONS.violeta },
  "solicitacoes-email": { icone: MessageSquareText, area: "IA", departamento: "Pessoal", tom: TONS.violeta },
  "leitor-nfse": { icone: Receipt, area: "IA", departamento: "Fiscal", tom: TONS.violeta },
  "classificacao-notas": { icone: Tags, area: "IA", departamento: "Fiscal", tom: TONS.violeta },
  "leitor-guias": { icone: Barcode, area: "IA", departamento: "Fiscal", tom: TONS.violeta },
  "envio-guias": { icone: FileCheck2, area: "E-mail", departamento: "Fiscal", tom: TONS.azul },
  "extratos-conciliacao": { icone: ArrowLeftRight, area: "IA", departamento: "Contábil", tom: TONS.violeta },
  "leitor-comprovantes": { icone: ReceiptText, area: "IA", departamento: "Contábil", tom: TONS.violeta },
  "contrato-social": { icone: ScrollText, area: "IA", departamento: "Societário", tom: TONS.violeta },
  "monitor-vencimentos": { icone: Hourglass, area: "Robô", departamento: "Societário", tom: TONS.marca },
  "caixas-postais": { icone: Mailbox, area: "Robô", departamento: "Fiscal", tom: TONS.marca },
};
const VISUAL_PADRAO: Visual = { icone: Cog, area: "Rotina", departamento: "Geral", tom: TONS.marca };
const visual = (r: { chave: string }) => VISUAL[r.chave] ?? VISUAL_PADRAO;
const DEPARTAMENTOS = ["Fiscal", "Contábil", "Pessoal", "Societário", "Geral"];
// Ícone de cada tipo no filtro (o do cartão é o da automação).
const ICONE_TIPO: Record<string, LucideIcon> = {
  "E-mail": Mail,
  Certidões: ShieldCheck,
  IA: ScanLine,
  Integração: RefreshCw,
  Receita: Landmark,
  Robô: Bot,
  Tarefas: ListChecks,
};

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function relativo(iso: string) {
  const min = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  const fmt = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  if (Math.abs(min) < 60) return fmt.format(min, "minute");
  const horas = Math.round(min / 60);
  if (Math.abs(horas) < 48) return fmt.format(horas, "hour");
  return fmt.format(Math.round(horas / 24), "day");
}

async function Conteudo({ searchParams }: { searchParams: Busca }) {
  const usuario = await getUsuario();
  const params = await searchParams;
  const busca = String(params.busca ?? "").trim().slice(0, 100);
  const tipo = String(params.tipo ?? "").slice(0, 40);
  const dep = String(params.dep ?? "").slice(0, 40);
  if (!usuario.ativo) {
    return (
      <div className="mt-8 flex items-center gap-3 rounded-card bg-superficie ring-1 ring-borda p-5 text-sm text-texto-suave">
        <Lock className="size-4 shrink-0 text-destaque" />
        Seu acesso ainda não foi ativado.
      </div>
    );
  }

  const rotinas = await listarRotinas(usuario.papel !== "colaborador");
  const ok = rotinas.filter((r) => r.saude === "ok").length;
  const atencao = rotinas.filter((r) => r.saude === "atencao").length;
  const proxima = rotinas
    .filter((r): r is Rotina & { proxima: string } => !!r.proxima)
    .sort((a, b) => a.proxima.localeCompare(b.proxima))[0];

  // Busca + filtros. As contagens de cada opção consideram os outros filtros.
  const naBusca = rotinas.filter((r) => combina(busca, r.titulo, r.descricao, r.agenda, r.onde, r.resumo, visual(r).area, visual(r).departamento));
  const doTipo = (r: { chave: string }) => !tipo || visual(r).area === tipo;
  const doDep = (r: { chave: string }) => !dep || visual(r).departamento === dep;
  const rotinasVisiveis = naBusca.filter((r) => doTipo(r) && doDep(r));
  const filtrando = Boolean(tipo || dep);
  const planejadasNaBusca = automacoesPlanejadas.filter((a) => combina(busca, a.titulo, a.descricao, visual(a).area, visual(a).departamento));
  const planejadasVisiveis = planejadasNaBusca.filter((a) => doTipo(a) && doDep(a));
  const nada = rotinasVisiveis.length === 0 && planejadasVisiveis.length === 0;

  // Opções e contagens dos filtros: ativas + em breve.
  const todas: { chave: string }[] = [...rotinas, ...automacoesPlanejadas];
  const todasNaBusca: { chave: string }[] = [...naBusca, ...planejadasNaBusca];
  const tipos = [...new Set(todas.map((r) => visual(r).area))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const deps = DEPARTAMENTOS.filter((d) => todas.some((r) => visual(r).departamento === d));
  const url = (mudar: { tipo?: string; dep?: string }) => {
    const q = new URLSearchParams();
    if (busca) q.set("busca", busca);
    const t = mudar.tipo ?? tipo;
    const d = mudar.dep ?? dep;
    if (t) q.set("tipo", t);
    if (d) q.set("dep", d);
    const s = q.toString();
    return s ? `/automacoes?${s}` : "/automacoes";
  };

  return (
    <>
      <div className="entrada mt-8 grid gap-3 sm:grid-cols-3">
        <Resumo rotulo="Ativas" valor={String(rotinas.length)} detalhe={`${ok} funcionando`} />
        <Resumo
          rotulo="Pedem atenção"
          valor={String(atencao)}
          detalhe={atencao ? "Veja os cartões marcados" : "Tudo em ordem"}
          destaque={atencao > 0}
        />
        <Resumo
          rotulo="Próxima execução"
          valor={proxima ? relativo(proxima.proxima) : "—"}
          detalhe={proxima?.titulo ?? ""}
        />
      </div>

      <div className="mt-6">
        <BuscaAutomacoes key={busca} busca={busca} filtros={{ tipo, dep }} />
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        <Filtro
          rotulo="Tipo"
          opcoes={tipos.map((t) => ({
            valor: t,
            icone: ICONE_TIPO[t] ?? Object.values(VISUAL).find((v) => v.area === t)?.icone,
            total: todasNaBusca.filter((r) => visual(r).area === t && doDep(r)).length,
          }))}
          ativo={tipo}
          todos={todasNaBusca.filter(doDep).length}
          url={(v) => url({ tipo: v })}
        />
        <Filtro
          rotulo="Departamento"
          opcoes={deps.map((d) => ({ valor: d, total: todasNaBusca.filter((r) => visual(r).departamento === d && doTipo(r)).length }))}
          ativo={dep}
          todos={todasNaBusca.filter(doTipo).length}
          url={(v) => url({ dep: v })}
        />
      </div>

      {nada && (
        <div className="mt-6 rounded-card bg-superficie ring-1 ring-borda px-6 py-10 text-center text-sm text-texto-suave">
          <p className="font-semibold text-texto">
            Nenhuma automação encontrada{busca ? ` para “${busca}”` : ""}
            {tipo ? ` do tipo ${tipo}` : ""}
            {dep ? ` em ${dep}` : ""}.
          </p>
          <Link href="/automacoes" className="mt-2 inline-block font-semibold text-destaque hover:text-texto">
            Limpar busca e filtros
          </Link>
        </div>
      )}

      {rotinasVisiveis.length > 0 && (
        <section className="mt-8">
          <Titulo texto="Em funcionamento" total={busca || filtrando ? rotinasVisiveis.length : undefined} />
          <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rotinasVisiveis.map((r) => (
              <CartaoRotina key={r.chave} rotina={r} />
            ))}
          </ul>
        </section>
      )}

      {planejadasVisiveis.length > 0 && (
        <section className="mt-8">
          <Titulo texto="Em breve" total={busca || filtrando ? planejadasVisiveis.length : undefined} />
          <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {planejadasVisiveis.map((a) => (
              <CartaoPlanejada key={a.chave} automacao={a} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Titulo({ texto, total }: { texto: string; total?: number }) {
  return (
    <h2 className="text-xs font-semibold tracking-[0.15em] text-texto-suave uppercase">
      {texto}
      {total !== undefined && <span className="ml-1.5">({total})</span>}
    </h2>
  );
}

// Linha de filtro: "Todos" + uma pílula por opção, com a contagem. Clicar na
// opção ativa volta para "Todos".
function Filtro({
  rotulo,
  opcoes,
  ativo,
  todos,
  url,
}: {
  rotulo: string;
  opcoes: { valor: string; total: number; icone?: LucideIcon }[];
  ativo: string;
  todos: number;
  url: (valor: string) => string;
}) {
  const pilula = (selecionada: boolean) =>
    `flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors ${
      selecionada ? "bg-primaria text-sobre-primaria" : "bg-superficie text-texto ring-1 ring-borda hover:bg-suave"
    }`;
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
      <span className="w-32 shrink-0 text-[11px] font-semibold tracking-[0.12em] whitespace-nowrap text-texto-suave uppercase">{rotulo}</span>
      <Link href={url("")} scroll={false} className={pilula(!ativo)}>
        Todos <span className={!ativo ? "text-sobre-primaria/70" : "text-texto-suave"}>{todos}</span>
      </Link>
      {opcoes.map(({ valor, total, icone: Icone }) => {
        const sel = ativo === valor;
        return (
          <Link
            key={valor}
            href={url(sel ? "" : valor)}
            scroll={false}
            aria-current={sel ? "true" : undefined}
            className={`${pilula(sel)} ${!total && !sel ? "opacity-45" : ""}`}
          >
            {Icone && <Icone className="size-3.5" />}
            {valor} <span className={sel ? "text-sobre-primaria/70" : "text-texto-suave"}>{total}</span>
          </Link>
        );
      })}
    </div>
  );
}

function Resumo({ rotulo, valor, detalhe, destaque }: { rotulo: string; valor: string; detalhe: string; destaque?: boolean }) {
  return (
    <section className="rounded-card bg-superficie ring-1 ring-borda px-5 py-4">
      <h2 className="text-xs font-medium text-texto-suave">{rotulo}</h2>
      <p className={`mt-1 font-display text-2xl tabular-nums ${destaque ? "text-alerta" : "text-texto"}`}>{valor}</p>
      <p className="truncate text-xs text-texto-suave">{detalhe}</p>
    </section>
  );
}

// O cartão inteiro é clicável (o link cobre o cartão com ::after); a ação
// extra fica por cima, em z-10, para não ser um botão dentro de um link.
function CartaoRotina({ rotina: r }: { rotina: Rotina }) {
  const e = estilos[r.saude];
  const alerta = r.saude === "atencao";
  const v = visual(r);
  const Icone = v.icone;
  return (
    <li>
      <div
        className={`group relative flex h-full flex-col overflow-hidden rounded-card bg-superficie px-5 py-4 ring-1 transition duration-200 hover:-translate-y-0.5 hover:shadow-elevado ${
          alerta ? "ring-alerta-ponto/60" : `ring-borda ${v.tom.anel}`
        }`}
      >
        {/* Detalhe: o ícone da automação, grande e quase transparente, no canto. */}
        <Icone
          aria-hidden
          strokeWidth={1.25}
          className={`pointer-events-none absolute -right-5 -bottom-6 size-28 -rotate-12 opacity-[0.05] transition duration-300 group-hover:-rotate-6 group-hover:opacity-[0.09] ${v.tom.cor}`}
        />

        <div className="flex items-start justify-between gap-3">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${v.tom.fundo} ${v.tom.cor} transition-transform duration-200 group-hover:scale-105`}
          >
            <Icone className="size-5" strokeWidth={1.75} />
          </span>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${v.tom.fundo} ${v.tom.cor}`}>
              {v.area}
            </span>
            <ArrowUpRight className="size-4 text-texto-suave opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        </div>

        <Link
          href={r.href}
          title={r.descricao}
          className="mt-3 font-semibold text-texto after:absolute after:inset-0 after:rounded-card"
        >
          {r.titulo}
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-texto-suave">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold ${e.chip} ${e.texto}`}>
            <span
              className={`size-1.5 rounded-full ${e.ponto} ${r.saude === "ok" ? "animate-pulse" : ""}`}
              aria-hidden="true"
            />
            {e.rotulo}
          </span>
          <span>{r.agenda}</span>
        </div>

        <p className={`mt-3 line-clamp-2 text-sm ${alerta ? "text-alerta" : "text-texto/80"}`}>{r.resumo}</p>

        {r.acao === "previa-resumo" && (
          <span className="relative z-10">
            <BotaoPreviaResumo />
          </span>
        )}

        <div className="relative mt-auto pt-4">
          <div className="flex justify-between gap-3 border-t border-borda pt-3 text-xs text-texto-suave tabular-nums [&_span]:whitespace-nowrap">
            <span title={r.ultima ? dataHora.format(new Date(r.ultima)) : undefined}>
              Última: {r.ultima ? relativo(r.ultima) : "—"}
            </span>
            <span title={r.proxima ? dataHora.format(new Date(r.proxima)) : undefined}>
              Próxima: {r.proxima ? relativo(r.proxima) : "sob demanda"}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}

// Ideia ainda não feita: o mesmo cartão, em cinza e tracejado. Ao passar o
// mouse, o ícone ganha a cor da área (um gostinho do que vem).
function CartaoPlanejada({ automacao: a }: { automacao: { chave: string; titulo: string; descricao: string } }) {
  const v = visual(a);
  const Icone = v.icone;
  return (
    <li className="group relative flex h-full flex-col overflow-hidden rounded-card border border-dashed border-borda bg-superficie/50 px-5 py-4 transition duration-200 hover:bg-superficie">
      <Icone
        aria-hidden
        strokeWidth={1.25}
        className="pointer-events-none absolute -right-5 -bottom-6 size-28 -rotate-12 text-texto-suave opacity-[0.05] transition duration-300 group-hover:-rotate-6"
      />
      <div className="flex items-start justify-between gap-3">
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl bg-suave text-texto-suave/70 transition-colors duration-200 ${v.tom.realce}`}
        >
          <Icone className="size-5" strokeWidth={1.75} />
        </span>
        <span className="flex items-center gap-1 rounded-full bg-suave px-2 py-0.5 text-[10px] font-semibold tracking-wide text-texto-suave uppercase">
          <Sparkles className="size-3" /> Em breve
        </span>
      </div>
      <p className="mt-3 font-semibold text-texto-suave">{a.titulo}</p>
      <p className="mt-0.5 text-xs text-texto-suave/80">
        {v.area} · {v.departamento}
      </p>
      <p className="mt-3 line-clamp-3 text-sm text-texto-suave/90">{a.descricao}</p>
    </li>
  );
}

function Carregando() {
  return (
    <div>
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="brilho h-24 rounded-card bg-superficie" />
        ))}
      </div>
      <div className="mt-14 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="brilho h-44 rounded-card bg-superficie" />
        ))}
      </div>
    </div>
  );
}
