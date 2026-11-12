import {
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardCheck,
  HandCoins,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  Settings,
  ShieldCheck,
  Bot,
  type LucideIcon,
} from "lucide-react";

export type ItemNav = {
  href: string;
  rotulo: string;
  icone: LucideIcon;
  /** Contador exibido ao lado do item (ex.: tarefas pendentes). */
  contador?: number;
  /** Mostra o ponto de "há novidades" (versão nova não vista). */
  novidade?: boolean;
};

export const navPrincipal: ItemNav[] = [
  { href: "/", rotulo: "Início", icone: LayoutDashboard },
  { href: "/minhas-tarefas", rotulo: "Minhas tarefas", icone: ClipboardCheck },
  { href: "/tarefas", rotulo: "Tarefas", icone: ListChecks },
  { href: "/clientes", rotulo: "Clientes", icone: Building2 },
  { href: "/cnd", rotulo: "Certidões", icone: ShieldCheck },
  { href: "/adiantamento", rotulo: "Adiantamento", icone: HandCoins },
  { href: "/obrigacoes", rotulo: "Obrigações", icone: ScrollText },
  { href: "/calendario", rotulo: "Calendário", icone: CalendarDays },
  { href: "/relatorios", rotulo: "Relatórios", icone: BarChart3 },
  { href: "/automacoes", rotulo: "Automações", icone: Bot },
];

export const navRodape: ItemNav[] = [
  { href: "/configuracoes", rotulo: "Configurações", icone: Settings, novidade: true },
];

// Cores de identificação dos departamentos (pontos e barras). Precisam ser hex:
// alguns gráficos somam transparência ao valor (ex.: `${cor}55`).
export type Departamento = { slug: string; nome: string; cor: string };

export const departamentos: Departamento[] = [
  { slug: "fiscal", nome: "Fiscal", cor: "#4F7CAC" },
  { slug: "contabil", nome: "Contábil", cor: "#D9A441" },
  { slug: "pessoal", nome: "Pessoal", cor: "#6F9E7F" },
  { slug: "societario", nome: "Societário", cor: "#9C7BB0" },
  { slug: "financeiro", nome: "Financeiro", cor: "#3E9B9B" },
];
