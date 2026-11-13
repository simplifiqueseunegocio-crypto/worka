import { Building2, ClipboardList, Landmark } from "lucide-react";
import type { ClienteDetalhe } from "@/lib/clientes";
import { cadastroCliente, ROTULO_CAMPO_RECEITA } from "@/lib/cliente-painel";
import { formatarCnae, formatarDocumento, formatarMunicipio, rotuloDocumento } from "@/lib/formatar";
import { corDepartamento } from "@/components/tarefas/prazo";
import { Cartao, Chip, Vazio, dataBR, dataHora } from "./ui";

const PERIODICIDADE: Record<string, string> = { mensal: "mensal", trimestral: "trimestral", anual: "anual" };

export async function AbaCadastro({ cliente, contatos }: { cliente: ClienteDetalhe; contatos: React.ReactNode }) {
  const c = await cadastroCliente(cliente.id);
  const endereco = [
    [cliente.logradouro, cliente.numero].filter(Boolean).join(", "),
    cliente.complemento,
    cliente.bairro,
    formatarMunicipio(cliente.municipio, cliente.uf),
    cliente.cep,
  ]
    .filter(Boolean)
    .join(" · ");
  const dados: [string, string | null][] = [
    [rotuloDocumento(cliente.documento, cliente.tipo_inscricao), formatarDocumento(cliente.documento, cliente.tipo_inscricao)],
    ["Código no Domínio", cliente.codigo_dominio?.toString() ?? null],
    ["Inscrição estadual", cliente.inscricao_estadual],
    ["Inscrição municipal", cliente.inscricao_municipal],
    ["Atividade", [formatarCnae(cliente.cnae), cliente.ramo_atividade].filter(Boolean).join(" · ") || null],
    ["Início da atividade", cliente.data_inicio_atividade ? dataBR(cliente.data_inicio_atividade.slice(0, 10)) : null],
    ["Endereço", endereco || null],
    ["Telefone", cliente.telefone],
    ["E-mail", cliente.email],
    ["Responsável legal", cliente.responsavel_legal],
  ];

  // Obrigações agrupadas por departamento.
  const porDep = new Map<string, typeof c.obrigacoes>();
  for (const o of c.obrigacoes) {
    const dep = o.departamento?.nome ?? "Outros";
    porDep.set(dep, [...(porDep.get(dep) ?? []), o]);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-5">
      <Cartao
        titulo="Dados cadastrais"
        subtitulo={cliente.sincronizado_em ? `Sincronizado com a Conta Azul em ${dataHora(cliente.sincronizado_em)}` : "Cadastrado na plataforma"}
        icone={Building2}
        className="xl:col-span-3"
      >
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {dados.map(([rotulo, valor]) => (
            <div key={rotulo} className="min-w-0">
              <dt className="text-[11px] font-semibold tracking-[0.15em] text-texto-suave uppercase">{rotulo}</dt>
              <dd className="mt-0.5 text-sm break-words text-texto">{valor || "—"}</dd>
            </div>
          ))}
        </dl>
      </Cartao>

      <Cartao
        titulo="Receita Federal"
        subtitulo={c.receita ? `Conferido em ${dataHora(c.receita.verificado_em)}` : "Conferência automática do CNPJ"}
        icone={Landmark}
        className="xl:col-span-2"
      >
        {!c.receita ? (
          <Vazio>Ainda não conferido na Receita.</Vazio>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
              <div>
                <dt className="text-[11px] font-semibold tracking-[0.15em] text-texto-suave uppercase">Situação</dt>
                <dd className={`mt-0.5 font-semibold ${c.receita.situacao && !/ATIVA/i.test(c.receita.situacao) ? "text-perigo" : "text-sucesso"}`}>
                  {c.receita.situacao ?? "—"}
                  {c.receita.data_situacao ? <span className="font-normal text-texto-suave"> desde {dataBR(c.receita.data_situacao)}</span> : null}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold tracking-[0.15em] text-texto-suave uppercase">Enquadramento</dt>
                <dd className="mt-0.5 font-semibold text-texto">
                  {c.receita.mei ? "MEI" : c.receita.simples ? "Simples Nacional" : c.receita.simples === false ? "Fora do Simples" : "—"}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[11px] font-semibold tracking-[0.15em] text-texto-suave uppercase">Atividade principal</dt>
                <dd className="mt-0.5 text-texto">
                  {c.receita.cnae ? `${formatarCnae(String(c.receita.cnae))} · ` : ""}
                  {c.receita.cnae_descricao ?? "—"}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[11px] font-semibold tracking-[0.15em] text-texto-suave uppercase">Endereço na Receita</dt>
                <dd className="mt-0.5 text-texto">{c.receita.endereco ?? "—"}</dd>
              </div>
            </dl>
            {c.receita.erro && <p className="mt-3 text-xs text-alerta">Última consulta falhou: {c.receita.erro}</p>}
            {c.alertas.length > 0 && (
              <div className="mt-4 border-t border-borda pt-3">
                <p className="text-[11px] font-semibold tracking-[0.15em] text-texto-suave uppercase">Mudanças detectadas</p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {c.alertas.map((a) => (
                    <li key={a.id} className="text-sm text-texto">
                      <span className="text-xs text-texto-suave">{dataBR(a.criado_em.slice(0, 10))} · </span>
                      {ROTULO_CAMPO_RECEITA[a.campo] ?? a.campo}: <span className="text-texto-suave line-through">{a.de ?? "—"}</span> → <strong>{a.para ?? "—"}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </Cartao>

      <Cartao
        titulo="Obrigações"
        subtitulo={`${c.obrigacoes.filter((o) => o.ativo).length} ativas · geram as tarefas de cada competência`}
        icone={ClipboardList}
        acao={{ href: "/obrigacoes", rotulo: "Obrigações" }}
        className="xl:col-span-5"
      >
        {c.obrigacoes.length === 0 ? (
          <Vazio>Nenhuma obrigação ligada a este cliente.</Vazio>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[...porDep.entries()].map(([dep, lista]) => (
              <div key={dep} className="rounded-bloco border border-borda p-3">
                <p className="flex items-center gap-2 text-sm font-bold text-texto">
                  <span className="size-2.5 rounded-full" style={{ background: corDepartamento(dep) }} /> {dep}
                  <span className="ml-auto text-xs font-semibold text-texto-suave">{lista.filter((o) => o.ativo).length}</span>
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  {lista.map((o) => (
                    <li key={o.id} className={`flex items-center gap-2 text-sm ${o.ativo ? "text-texto" : "text-texto-suave line-through"}`}>
                      <span className="min-w-0 flex-1 truncate">{o.nome}</span>
                      <Chip>{PERIODICIDADE[o.periodicidade] ?? o.periodicidade} · dia {o.dia_vencimento}</Chip>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Cartao>

      <section id="contatos" className="min-w-0 scroll-mt-6 rounded-card bg-superficie ring-1 ring-borda p-5 sm:p-6 xl:col-span-5">
        {contatos}
      </section>
    </div>
  );
}
