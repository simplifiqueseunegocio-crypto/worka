import { Landmark, ReceiptText, Wallet } from "lucide-react";
import { fiscalCliente } from "@/lib/cliente-painel";
import { hojeISO } from "@/lib/tarefas";
import { ROTULO_FORMA, ROTULO_GUIA } from "@/lib/documentos/tipos";
import { Cartao, Chip, NaoInstalado, SemAcesso, Vazio, dataBR, diasAte, mesBR, real } from "./ui";

export async function AbaFiscal({ clienteId, acesso }: { clienteId: string; acesso: { nfse: boolean; guia: boolean; comprovante: boolean } }) {
  const f = await fiscalCliente(clienteId);
  const hoje = hojeISO();
  const maior = Math.max(1, ...f.porMes.map(([, t]) => Math.max(t.prestadas, t.tomadas)));

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Cartao
        titulo="Notas de serviço (NFS-e)"
        subtitulo="Lidas e confirmadas na plataforma · últimos 12 meses"
        icone={Landmark}
        acao={acesso.nfse ? { href: "/automacoes/documentos/nfse", rotulo: "Ler notas" } : undefined}
        className="xl:col-span-2"
      >
        {!acesso.nfse ? (
          <SemAcesso quem="o Fiscal, gestores e administradores" />
        ) : f.notas === null ? (
          <NaoInstalado modulo="de leitores fiscais" />
        ) : f.notas.length === 0 ? (
          <Vazio>Nenhuma NFS-e deste cliente lida na plataforma.</Vazio>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div>
              <div className="mb-2 flex items-center gap-4 text-xs text-texto-suave">
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-primaria" /> Prestadas (faturamento)</span>
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-areia" /> Tomadas</span>
              </div>
              <ul className="flex flex-col gap-2">
                {f.porMes.map(([mes, t]) => (
                  <li key={mes} className="grid grid-cols-[64px_minmax(0,1fr)_112px] items-center gap-3 text-sm">
                    <span className="font-semibold text-texto tabular-nums">{mes.slice(5, 7)}/{mes.slice(0, 4)}</span>
                    <span className="flex flex-col gap-1">
                      <span className="h-2.5 rounded-full bg-primaria" style={{ width: `${Math.max(1, (t.prestadas / maior) * 100)}%` }} title={`Prestadas: ${real(t.prestadas)}`} />
                      {t.tomadas > 0 && <span className="h-1.5 rounded-full bg-areia" style={{ width: `${(t.tomadas / maior) * 100}%` }} title={`Tomadas: ${real(t.tomadas)}`} />}
                    </span>
                    <span className="text-right text-xs text-texto-suave tabular-nums">
                      <span className="block font-semibold text-texto">{real(t.prestadas)}</span>
                      {t.tomadas > 0 && <span className="block">{real(t.tomadas)} tom.</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-texto-suave uppercase">Últimas notas</p>
              <ul className="divide-y divide-borda">
                {f.notas.slice(0, 8).map((n) => (
                  <li key={n.id} className="flex items-center gap-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-texto">
                        Nº {n.numero} · {n.papel === "prestada" ? n.tomador_nome ?? "tomador" : n.prestador_nome ?? "prestador"}
                      </span>
                      <span className="block text-xs text-texto-suave">
                        {dataBR(n.emitida_em)}
                        {n.iss_retido ? " · ISS retido" : ""}
                      </span>
                    </span>
                    <Chip tom={n.papel === "prestada" ? "neutro" : "aviso"}>{n.papel === "prestada" ? "Prestada" : "Tomada"}</Chip>
                    <span className="w-24 text-right text-sm font-semibold text-texto tabular-nums">{real(n.valor_servicos)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Cartao>

      <Cartao
        titulo="Guias"
        subtitulo="Em aberto e dos últimos 4 meses"
        icone={Wallet}
        acao={acesso.guia ? { href: "/automacoes/documentos/guia", rotulo: "Ler guias" } : undefined}
      >
        {!acesso.guia && !acesso.comprovante ? (
          <SemAcesso quem="Fiscal, Contábil, Pessoal, gestores e administradores" />
        ) : f.guias === null ? (
          <NaoInstalado modulo="de leitores fiscais" />
        ) : f.guias.length === 0 ? (
          <Vazio>Nenhuma guia deste cliente lida na plataforma.</Vazio>
        ) : (
          <ul className="divide-y divide-borda">
            {[...f.guias]
              .sort((a, b) => Number(Boolean(a.pago_em)) - Number(Boolean(b.pago_em)) || a.vencimento.localeCompare(b.vencimento))
              .map((g) => {
                const faltam = diasAte(hoje, g.vencimento);
                return (
                  <li key={g.id} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-texto">
                        {ROTULO_GUIA[g.tipo] ?? "Guia"}
                        {g.periodo ? ` ${mesBR(g.periodo)}` : ""}
                        {g.codigo_receita ? ` · ${g.codigo_receita}` : ""}
                      </span>
                      <span className="block text-xs text-texto-suave">vence {dataBR(g.vencimento)}</span>
                    </span>
                    {g.pago_em ? (
                      <Chip tom="ok">Paga {dataBR(g.pago_em).slice(0, 5)}</Chip>
                    ) : faltam < 0 ? (
                      <Chip tom="erro">Vencida</Chip>
                    ) : (
                      <Chip tom={faltam <= 5 ? "aviso" : "neutro"}>{faltam === 0 ? "Vence hoje" : `Em ${faltam} dia${faltam === 1 ? "" : "s"}`}</Chip>
                    )}
                    <span className="w-24 text-right text-sm font-semibold text-texto tabular-nums">{real(g.valor_total)}</span>
                  </li>
                );
              })}
          </ul>
        )}
      </Cartao>

      <Cartao
        titulo="Comprovantes de pagamento"
        subtitulo="Os mais recentes"
        icone={ReceiptText}
        acao={acesso.comprovante ? { href: "/automacoes/documentos/comprovante", rotulo: "Ler comprovantes" } : undefined}
      >
        {!acesso.comprovante ? (
          <SemAcesso quem="o Contábil, o Financeiro, gestores e administradores" />
        ) : f.comprovantes === null ? (
          <NaoInstalado modulo="de leitores fiscais" />
        ) : f.comprovantes.length === 0 ? (
          <Vazio>Nenhum comprovante deste cliente lido na plataforma.</Vazio>
        ) : (
          <ul className="divide-y divide-borda">
            {f.comprovantes.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-texto">{c.beneficiario_nome ?? "Beneficiário"}</span>
                  <span className="block text-xs text-texto-suave">
                    {dataBR(c.pago_em)} · {ROTULO_FORMA[c.forma] ?? c.forma}
                    {c.guia_id ? " · baixou guia" : ""}
                  </span>
                </span>
                <span className="w-24 text-right text-sm font-semibold text-texto tabular-nums">{real(c.valor)}</span>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </div>
  );
}
