import Link from "next/link";
import { Bot, HandCoins, ScanLine, Stethoscope, Users } from "lucide-react";
import { pessoalCliente } from "@/lib/cliente-painel";
import { hojeISO } from "@/lib/tarefas";
import { StatusLeitura } from "@/components/ponto/status-leitura";
import type { StatusLeitura as StatusDaLeitura } from "@/lib/ponto";
import { Cartao, Chip, NaoInstalado, SemAcesso, Vazio, dataBR, dataHora, mesBR } from "./ui";

const cpfBR = (c: string | null) => (c && c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : null);

export async function AbaPessoal({ clienteId, acessoDp }: { clienteId: string; acessoDp: boolean }) {
  const p = await pessoalCliente(clienteId);
  const hoje = hojeISO();
  const afastadosHoje = new Set((p.afastamentos ?? []).filter((a) => a.inicio <= hoje && a.fim >= hoje).map((a) => a.funcionario?.nome));

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Cartao
        titulo="Funcionários"
        subtitulo="Cadastrados pelas fichas ponto e atestados"
        icone={Users}
        acao={acessoDp ? { href: "/automacoes/ponto", rotulo: "Ler ficha ponto" } : undefined}
      >
        {!acessoDp ? (
          <SemAcesso quem="o DP, gestores e administradores" />
        ) : p.funcionarios === null ? (
          <NaoInstalado modulo="de ficha ponto" />
        ) : p.funcionarios.length === 0 ? (
          <Vazio>Nenhum funcionário cadastrado ainda.</Vazio>
        ) : (
          <ul className="grid max-h-[420px] gap-x-6 overflow-y-auto sm:grid-cols-2">
            {p.funcionarios.map((f) => (
              <li key={f.id} className="flex items-center gap-2.5 border-b border-borda py-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-suave text-[11px] font-bold text-destaque">
                  {f.nome
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((x) => x[0])
                    .join("")
                    .toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-texto">{f.nome}</span>
                  <span className="block truncate text-xs text-texto-suave">{[f.cargo, cpfBR(f.cpf)].filter(Boolean).join(" · ") || "—"}</span>
                </span>
                {afastadosHoje.has(f.nome) && <Chip tom="aviso">Afastado</Chip>}
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao
        titulo="Afastamentos"
        subtitulo="Atestados e comparecimentos dos últimos 4 meses"
        icone={Stethoscope}
        acao={acessoDp ? { href: "/automacoes/documentos/atestado", rotulo: "Ler atestados" } : undefined}
      >
        {!acessoDp ? (
          <SemAcesso quem="o DP, gestores e administradores" />
        ) : p.afastamentos === null ? (
          <NaoInstalado modulo="de documentos" />
        ) : p.afastamentos.length === 0 ? (
          <Vazio>Nenhum afastamento lançado.</Vazio>
        ) : (
          <ul className="divide-y divide-borda">
            {p.afastamentos.map((a) => {
              const agora = a.inicio <= hoje && a.fim >= hoje;
              return (
                <li key={a.id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-texto">{a.funcionario?.nome ?? "Funcionário"}</span>
                    <span className="block text-xs text-texto-suave">
                      {a.tipo === "comparecimento"
                        ? `${dataBR(a.inicio)} · ${a.hora_inicio?.slice(0, 5)} às ${a.hora_fim?.slice(0, 5)}`
                        : `${a.dias} dia${a.dias === 1 ? "" : "s"} · ${dataBR(a.inicio)}${a.fim !== a.inicio ? ` a ${dataBR(a.fim)}` : ""}`}
                    </span>
                  </span>
                  {agora ? <Chip tom="aviso">Em curso</Chip> : <Chip>{a.tipo === "comparecimento" ? "Horas" : "Atestado"}</Chip>}
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>

      <Cartao titulo="Fichas ponto" subtitulo="Leituras enviadas" icone={ScanLine}>
        {!acessoDp ? (
          <SemAcesso quem="o DP, gestores e administradores" />
        ) : p.leiturasPonto === null ? (
          <NaoInstalado modulo="de ficha ponto" />
        ) : p.leiturasPonto.length === 0 ? (
          <Vazio>Nenhuma ficha ponto deste cliente.</Vazio>
        ) : (
          <ul className="divide-y divide-borda">
            {p.leiturasPonto.map((l) => (
              <li key={l.id}>
                <Link href={`/automacoes/ponto/${l.id}`} className="flex items-center gap-3 py-2.5 hover:bg-fundo">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-texto">Competência {l.competencia ? mesBR(l.competencia) : "—"}</span>
                    <span className="block text-xs text-texto-suave">enviada em {dataHora(l.enviada_em)}</span>
                  </span>
                  <StatusLeitura status={l.status as StatusDaLeitura} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao titulo="DET · Caixa Postal" subtitulo="Avisos lidos pelo robô (só a lista, sem abrir mensagens)" icone={Bot} acao={{ href: "/automacoes/det", rotulo: "Robô do DET" }}>
        {p.det === null ? (
          <NaoInstalado modulo="do DET" />
        ) : p.det.length === 0 ? (
          <Vazio>Nenhum aviso registrado.</Vazio>
        ) : (
          <ul className="divide-y divide-borda">
            {p.det.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-texto">{d.assunto}</span>
                  <span className="block text-xs text-texto-suave">
                    {dataBR(d.enviada_em)}
                    {d.competencia_desconto ? ` · desconto em ${mesBR(d.competencia_desconto)}` : ""}
                  </span>
                </span>
                {d.consignado && <Chip tom="aviso">Consignado</Chip>}
                {d.lida === false && <Chip tom="erro">Não lida</Chip>}
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      {p.adiantamentos !== null && p.adiantamentos.length > 0 && (
        <Cartao titulo="Adiantamentos enviados" subtitulo="E-mails de adiantamento ao cliente" icone={HandCoins} acao={{ href: "/adiantamento", rotulo: "Adiantamento" }} className="xl:col-span-2">
          <ul className="divide-y divide-borda">
            {p.adiantamentos.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-texto">Competência {mesBR(a.competencia)} · {a.arquivo_nome}</span>
                  <span className="block truncate text-xs text-texto-suave">
                    {dataHora(a.enviado_em)} · para {a.destinatarios.join(", ")}
                  </span>
                </span>
                {a.erro ? <Chip tom="erro">Falhou</Chip> : <Chip tom="ok">Enviado</Chip>}
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </div>
  );
}
