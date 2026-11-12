import "server-only";
import { z } from "zod";
import type { PaginaLida } from "@/lib/ponto-texto";
import { extrairComIa, hojeSP, imagensPorPedido, paraleloIa, type FornecedorIa } from "@/lib/ia-extracao";

// IA da ficha ponto: o formato da resposta e as instruções. A chamada (Groq ou
// Claude, conforme o .env) fica no motor comum, ia-extracao.ts.
// A IA só TRANSCREVE; cálculo e alertas ficam em ponto-regras.ts.

export { fornecedorIa, paraleloIa, type FornecedorIa } from "@/lib/ia-extracao";
export const paginasPorPedido = imagensPorPedido;

export const INSTRUCOES = `Você transcreve fichas de ponto (cartão ponto, folha de ponto) de funcionários de empresas brasileiras para um escritório de contabilidade. O Departamento Pessoal vai conferir tudo depois, então transcreva com fidelidade e marque o que for incerto. Não calcule, não corrija e não complete horários.

Regras:
- Uma entrada em "fichas" para cada funcionário que aparece. Se a imagem não tiver ficha de ponto preenchida (folha em branco, só cabeçalho, outro documento), devolva "fichas" vazia.
- "dias": um item por dia listado na ficha, em ordem, inclusive os dias sem marcação. Datas em "AAAA-MM-DD". Se a ficha não mostrar o ano, use o ano da competência informada.
- "marcacoes": todos os horários batidos no dia, na ordem em que aparecem (entrada, saída, entrada, saída...), no formato "HH:MM", ignorando traços e campos vazios. Use o layout visual para decidir a que dia pertence cada horário. "manual": true quando o horário estiver marcado como lançado manualmente (por exemplo com asterisco *) ou pré-assinalado.
- MINUTOS EXATOS: leia cada dígito dos minutos de cada horário. Nunca arredonde (18:09 é "18:09", não "18:00") e nunca use o horário da jornada, do cabeçalho ou de outro dia para preencher uma marcação: a saída real costuma variar de um dia para o outro (18:07, 18:12, 17:58). Copie só o que está escrito naquele dia. Se não der para ler os minutos com certeza, escreva o que conseguir ver e explique em "duvida".
- "ocorrencia": texto que aparece no lugar das marcações, copiado como está (FÉRIAS, ATESTADO, AT/MED, ABONO, BCO/HRS, FOLGA, FERIADO, DSR, DOMINGO, COMPENSADO...). Pode existir junto com marcações. Sem ocorrência, null.
- "observacao": anotação que se refere ao dia, inclusive as do rodapé (exemplo: "ATESTADO — DIA 14.08: 08:40 às 10:40" vai no dia 14). Repita as observações gerais em "observacoes".
- "duvida": quando um horário estiver ilegível, rasurado, ambíguo ou você não tiver certeza da leitura, explique em poucas palavras; caso contrário null.
- "jornada": o horário contratual ou a carga diária por dia da semana (dia: seg, ter, qua, qui, sex, sab, dom), se a ficha informar; senão, lista vazia.
- "totais_origem": totais já calculados impressos na ficha (linha TOTAIS, saldo); senão, lista vazia.
- Documentos (CNPJ, CPF): só os dígitos.
- Quando vierem várias imagens, elas são páginas em sequência: uma página sem nome do funcionário (verso, 2ª quinzena) continua a ficha da página anterior. Junte tudo numa só ficha, com o nome e o mês da primeira página.
- Datas: use o mês escrito na ficha (por exemplo "MÊS: OUTUBRO"). Se a ficha não mostrar o ano, use o da competência informada; sem competência, use o ano mais recente em que a data não fique no futuro.`;


const pedido = (competencia: string | null, paginas: number) =>
  `Hoje é ${hojeSP()}. ${competencia ? `Competência informada pelo DP: ${competencia}.` : "Competência não informada: use a da própria ficha."} ${paginas > 1 ? `São ${paginas} páginas em sequência.` : ""} Transcreva a ficha.`;

// ---------------------------------------------------------------------------
// Claude (Anthropic SDK, saída estruturada)

const Hora = z.string();
const SchemaZod = z.object({
  empresa: z.string().nullable(),
  documento_empresa: z.string().nullable(),
  competencia: z.string().nullable(),
  fichas: z.array(
    z.object({
      nome: z.string(),
      cpf: z.string().nullable(),
      cargo: z.string().nullable(),
      admissao: z.string().nullable(),
      jornada: z.array(
        z.object({
          dia: z.enum(["seg", "ter", "qua", "qui", "sex", "sab", "dom"]),
          entrada: Hora.nullable(),
          saida: Hora.nullable(),
          intervalo_inicio: Hora.nullable(),
          intervalo_fim: Hora.nullable(),
          carga: Hora.nullable(),
        }),
      ),
      dias: z.array(
        z.object({
          data: z.string(),
          marcacoes: z.array(z.object({ hora: Hora, manual: z.boolean() })),
          ocorrencia: z.string().nullable(),
          observacao: z.string().nullable(),
          duvida: z.string().nullable(),
        }),
      ),
      totais_origem: z.array(z.object({ rotulo: z.string(), valor: z.string() })),
      observacoes: z.string().nullable(),
    }),
  ),
});

export async function lerComIa(fornecedor: FornecedorIa, imagens: Buffer[], competencia: string | null, rotulo: string): Promise<PaginaLida> {
  return extrairComIa(fornecedor, { imagens, instrucoes: INSTRUCOES, texto: pedido(competencia, imagens.length), schema: SchemaZod, nome: "ficha_ponto", rotulo });
}

// Garante que o schema continua compatível com o tipo do leitor sem IA.
const _compativel: (x: z.infer<typeof SchemaZod>) => PaginaLida = (x) => x;
void _compativel;
void paraleloIa;
