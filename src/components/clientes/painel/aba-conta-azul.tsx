import Link from "next/link";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Landmark, Link2, ReceiptText, Users, Wallet } from "lucide-react";
import { dadosContaAzul, type ParcelaAberta, type ResumoParcelas } from "@/lib/conta-azul-dados";
import { formatarDocumento } from "@/lib/formatar";
import { hojeISO } from "@/lib/tarefas";
import { Cartao, Chip, NaoInstalado, Vazio, dataBR, dataHora, diasAte, mesBR, real } from "./ui";

// Aba "Conta Azul": o que a plataforma lê da Conta Azul Pro do cliente.
export async function AbaContaAzul({ clienteId, admin }: { clienteId: string; admin: boolean }) {
  const hoje = hojeISO();
  const d = await dadosContaAzul(clienteId, hoje);
  if (!d) return <NaoInstalado modulo="financeiro da Conta Azul" />;

  if (!d.conexao) {
    return (
      <Cartao titulo="Conta Azul" subtitulo="Este cliente não está conectado" icone={Link2}>
        <Vazio>
          Conecte a Conta Azul Pro deste cliente para ver aqui o financeiro, as vendas e notas e os clientes e fornecedores.
          {admin && (
            <>
              {" "}
              <Link href="/configuracoes/conta-azul" className="font-semibold text-destaque hover:underline">
                Ir para Configurações → Conta Azul
              </Link>
            </>
          )}
        </Vazio>
      </Cartao>
    );
  }

  const c = d.conexao;
  return (
    <div className="grid gap-4">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-texto-suave">
        <span className="inline-flex items-center gap-1.5 font-semibold text-sucesso">
          <Link2 className="size-3.5" /> Conectado à Conta Azul
        </span>
        <span>Última leitura: {c.sincronizadoEm ? dataHora(c.sincronizadoEm) : "ainda não"}</span>
        <span>· atualiza todo dia às 23:00</span>
      </p>
      {c.aviso && (
        <p className="flex items-start gap-2 rounded-bloco bg-alerta-suave px-4 py-3 text-xs font-medium text-alerta">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {c.aviso}
        </p>
      )}

      {/* Números do momento */}
      <div className="grid gap-4 md:grid-cols-3">
        <Numero
          icone={Wallet}
          rotulo="Saldo em contas"
          valor={d.saldoTotal === null ? "—" : real(d.saldoTotal)}
          detalhe={`${d.contas.length} ${d.contas.length === 1 ? "conta financeira" : "contas financeiras"}`}
          negativo={(d.saldoTotal ?? 0) < 0}
        />
        <ResumoAberto icone={ArrowDownLeft} rotulo="A receber em aberto" r={d.receber} />
        <ResumoAberto icone={ArrowUpRight} rotulo="A pagar em aberto" r={d.pagar} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Cartao titulo="Recebimentos atrasados" subtitulo="Vencidos e ainda não recebidos (até 15)" icone={ArrowDownLeft}>
          <ListaParcelas parcelas={d.vencidasReceber} hoje={hoje} vazio="Nenhum recebimento atrasado." />
        </Cartao>
        <Cartao titulo="Pagamentos atrasados" subtitulo="Vencidos e ainda não pagos (até 15)" icone={ArrowUpRight}>
          <ListaParcelas parcelas={d.vencidasPagar} hoje={hoje} vazio="Nenhum pagamento atrasado." />
        </Cartao>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Cartao titulo="Vendas e notas" subtitulo="Últimos 3 meses" icone={ReceiptText}>
          {d.meses.length === 0 ? (
            <Vazio>Nenhum dado de vendas ou notas lido ainda.</Vazio>
          ) : (
            <div className="-mx-5 overflow-x-auto sm:-mx-6">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="text-[11px] font-semibold tracking-[0.12em] text-texto-suave uppercase">
                    <th className="px-5 py-2 font-semibold sm:px-6">Mês</th>
                    <th className="px-3 py-2 text-right font-semibold">Vendas aprovadas</th>
                    <th className="px-3 py-2 text-right font-semibold">NFS-e emitidas</th>
                    <th className="px-5 py-2 text-right font-semibold sm:px-6">NF-e</th>
                  </tr>
                </thead>
                <tbody>
                  {d.meses.map((m) => (
                    <tr key={m.competencia} className="border-t border-borda">
                      <td className="px-5 py-2.5 font-semibold text-texto sm:px-6">{mesBR(m.competencia)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {m.vendas_total === null ? "—" : real(m.vendas_total)}
                        <span className="block text-xs text-texto-suave">{m.vendas_qtd ?? 0} vendas</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {m.nfse_total === null ? "—" : real(m.nfse_total)}
                        <span className="block text-xs text-texto-suave">{m.nfse_qtd ?? 0} notas</span>
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums sm:px-6">{m.nfe_qtd ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Cartao>

        <Cartao titulo="Contas financeiras" subtitulo="Saldo atual na Conta Azul" icone={Landmark}>
          {d.contas.length === 0 ? (
            <Vazio>Nenhuma conta financeira ativa.</Vazio>
          ) : (
            <ul className="divide-y divide-borda">
              {d.contas.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-texto">{k.nome}</span>
                    <span className="block text-xs text-texto-suave">{rotuloConta(k.tipo, k.banco)}</span>
                  </span>
                  <span className={`shrink-0 font-semibold tabular-nums ${(k.saldo ?? 0) < 0 ? "text-perigo" : "text-texto"}`}>
                    {k.saldo === null ? "—" : real(k.saldo)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      <Cartao
        titulo="Clientes e fornecedores"
        subtitulo={`${d.pessoas.clientes} clientes · ${d.pessoas.fornecedores} fornecedores cadastrados na Conta Azul`}
        icone={Users}
      >
        {d.pessoas.lista.length === 0 ? (
          <Vazio>Nenhum cliente ou fornecedor na Conta Azul desta empresa.</Vazio>
        ) : (
          <>
            <ul className="grid gap-x-6 sm:grid-cols-2">
              {d.pessoas.lista.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 border-b border-borda py-2 text-sm">
                  <span className="min-w-0">
                    <span className={`block truncate font-medium ${p.ativo ? "text-texto" : "text-texto-suave line-through"}`}>{p.nome}</span>
                    {p.documento && <span className="block text-xs text-texto-suave">{formatarDocumento(p.documento)}</span>}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {p.perfis.map((x) => (
                      <Chip key={x} tom={x === "Fornecedor" ? "aviso" : "neutro"}>
                        {x}
                      </Chip>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            {d.pessoas.total > d.pessoas.lista.length && (
              <p className="mt-3 text-xs text-texto-suave">
                Mostrando {d.pessoas.lista.length} de {d.pessoas.total.toLocaleString("pt-BR")}, em ordem alfabética.
              </p>
            )}
          </>
        )}
      </Cartao>
    </div>
  );
}

const TIPOS_CONTA: Record<string, string> = {
  CONTA_CORRENTE: "Conta corrente",
  POUPANCA: "Poupança",
  CARTAO_CREDITO: "Cartão de crédito",
  APLICACAO: "Aplicação",
  INVESTIMENTO: "Investimento",
  CAIXINHA: "Caixinha",
  MEIOS_RECEBIMENTO: "Meios de recebimento",
  COBRANCAS_CONTA_AZUL: "Cobranças Conta Azul",
  RECEBA_FACIL_CARTAO: "Receba Fácil (cartão)",
  OUTROS: "Outros",
};

function rotuloConta(tipo: string | null, banco: string | null) {
  const t = tipo ? (TIPOS_CONTA[tipo] ?? tipo) : null;
  const b = banco ? banco.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase()) : null;
  return [t, b].filter(Boolean).join(" · ") || "—";
}

function Numero({
  icone: Icone,
  rotulo,
  valor,
  detalhe,
  negativo,
  children,
}: {
  icone: typeof Wallet;
  rotulo: string;
  valor: string;
  detalhe?: string;
  negativo?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-card bg-superficie p-5 ring-1 ring-borda">
      <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-texto-suave uppercase">
        <Icone className="size-4 text-destaque" /> {rotulo}
      </p>
      <p className={`mt-2 font-display text-2xl tabular-nums ${negativo ? "text-perigo" : "text-texto"}`}>{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-texto-suave">{detalhe}</p>}
      {children}
    </section>
  );
}

function ResumoAberto({ icone, rotulo, r }: { icone: typeof Wallet; rotulo: string; r: ResumoParcelas }) {
  return (
    <Numero icone={icone} rotulo={rotulo} valor={real(r.aberto)}>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-texto-suave">Vencido</dt>
          <dd className={`font-semibold tabular-nums ${r.vencido > 0 ? "text-perigo" : "text-texto"}`}>{real(r.vencido)}</dd>
        </div>
        <div>
          <dt className="text-texto-suave">Vence hoje</dt>
          <dd className="font-semibold text-texto tabular-nums">{real(r.venceHoje)}</dd>
        </div>
        <div>
          <dt className="text-texto-suave">Próx. 30 dias</dt>
          <dd className="font-semibold text-texto tabular-nums">{real(r.proximos30)}</dd>
        </div>
      </dl>
    </Numero>
  );
}

function ListaParcelas({ parcelas, hoje, vazio }: { parcelas: ParcelaAberta[]; hoje: string; vazio: string }) {
  if (parcelas.length === 0) return <Vazio>{vazio}</Vazio>;
  return (
    <ul className="divide-y divide-borda">
      {parcelas.map((p) => {
        const dias = p.vencimento ? diasAte(p.vencimento, hoje) : null;
        return (
          <li key={`${p.tipo}-${p.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="min-w-0">
              <span className="block truncate font-medium text-texto">{p.contraparte || p.descricao || "Sem descrição"}</span>
              <span className="block truncate text-xs text-texto-suave">
                {p.contraparte && p.descricao ? `${p.descricao} · ` : ""}venceu em {dataBR(p.vencimento)}
                {dias !== null && dias > 0 ? ` (há ${dias} ${dias === 1 ? "dia" : "dias"})` : ""}
              </span>
            </span>
            <span className="shrink-0 text-right font-semibold text-perigo tabular-nums">{real(p.nao_pago)}</span>
          </li>
        );
      })}
    </ul>
  );
}
