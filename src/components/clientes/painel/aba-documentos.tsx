import Link from "next/link";
import { FileStack, Hourglass } from "lucide-react";
import { documentosCliente } from "@/lib/cliente-painel";
import { hojeISO } from "@/lib/tarefas";
import { TIPOS_VENCIMENTO, type TipoVencimento } from "@/lib/vencimentos-regras";
import { tipoDocumento } from "@/lib/documentos/tipos";
import type { StatusLeitura as StatusDaLeitura } from "@/lib/ponto";
import { StatusLeitura } from "@/components/ponto/status-leitura";
import { Cartao, Chip, NaoInstalado, Vazio, dataBR, dataHora, diasAte } from "./ui";

export async function AbaDocumentos({ clienteId }: { clienteId: string }) {
  const d = await documentosCliente(clienteId);
  const hoje = hojeISO();

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Cartao
        titulo="Vencimentos"
        subtitulo="Certificados, alvarás, licenças, procurações e contratos"
        icone={Hourglass}
        acao={{ href: "/automacoes/vencimentos", rotulo: "Monitor de vencimentos" }}
      >
        {d.vencimentos === null ? (
          <NaoInstalado modulo="de vencimentos" />
        ) : d.vencimentos.length === 0 ? (
          <Vazio>Nenhum vencimento cadastrado para este cliente.</Vazio>
        ) : (
          <ul className="divide-y divide-borda">
            {d.vencimentos.map((v) => {
              const faltam = diasAte(hoje, v.vence_em);
              return (
                <li key={v.id} className={`flex items-center gap-3 py-2.5 ${v.ativo ? "" : "opacity-60"}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-texto">{v.descricao}</span>
                    <span className="block truncate text-xs text-texto-suave">
                      {TIPOS_VENCIMENTO[v.tipo as TipoVencimento] ?? v.tipo}
                      {v.identificador ? ` · ${v.identificador}` : ""} · vence {dataBR(v.vence_em)}
                    </span>
                  </span>
                  {!v.ativo ? (
                    <Chip>Arquivado</Chip>
                  ) : faltam < 0 ? (
                    <Chip tom="erro">Vencido</Chip>
                  ) : faltam <= v.avisar_dias ? (
                    <Chip tom="aviso">Em {faltam} dia{faltam === 1 ? "" : "s"}</Chip>
                  ) : (
                    <Chip tom="ok">Em dia</Chip>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>

      <Cartao titulo="Documentos lidos" subtitulo="Atestados, NFS-e, guias e comprovantes enviados aos leitores" icone={FileStack}>
        {d.leituras === null ? (
          <NaoInstalado modulo="de documentos" />
        ) : d.leituras.length === 0 ? (
          <Vazio>Nenhum documento deste cliente enviado aos leitores (ou sem acesso aos tipos lidos).</Vazio>
        ) : (
          <ul className="divide-y divide-borda">
            {d.leituras.map((l) => {
              const tipo = tipoDocumento(l.tipo);
              const n = l.itens[0]?.count ?? 0;
              return (
                <li key={l.id}>
                  <Link href={`/automacoes/documentos/${l.tipo}/${l.id}`} className="flex items-center gap-3 py-2.5 hover:bg-fundo">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-texto">
                        {tipo?.titulo.replace(/^Leitor de /, "").replace(/^./, (c) => c.toUpperCase()) ?? l.tipo}
                        {n ? ` · ${n} ${n === 1 ? tipo?.item.singular : tipo?.item.plural}` : ""}
                      </span>
                      <span className="block truncate text-xs text-texto-suave">
                        {dataHora(l.enviada_em)} · {l.arquivos[0]?.nome ?? ""}
                        {l.arquivos.length > 1 ? ` +${l.arquivos.length - 1}` : ""}
                      </span>
                    </span>
                    <StatusLeitura status={l.status as StatusDaLeitura} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>
    </div>
  );
}
