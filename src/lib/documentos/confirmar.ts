import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { digitos, lerCodigoBarras, mesmaEmpresa, somarDias, valor, type Dados } from "@/lib/documentos/tipos";

// O que a confirmação de cada tipo grava (e o que "reabrir" desfaz).
// Roda com o cliente do usuário (RLS de quem confirmou).

type Item = { id: string; dados: Dados; funcionario_id: string | null };
type Contexto = { supabase: SupabaseClient; clienteId: string; clienteDocumento: string | null; itens: Item[] };
type Acao = {
  confirmar: (c: Contexto) => Promise<string>; // resumo do que foi gravado
  desfazer: (c: Pick<Contexto, "supabase" | "itens">) => Promise<void>;
};

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const ouNulo = (v: unknown) => texto(v) || null;
const mesParaData = (v: unknown) => (/^\d{4}-\d{2}$/.test(texto(v)) ? `${texto(v)}-01` : null);
const barra = (v: unknown) => {
  const c = lerCodigoBarras(v);
  return c?.valido ? c.barra : null;
};
const contagem = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

// Apaga o que a confirmação lançou numa tabela (pelo item de origem).
const apagarLancados =
  (tabela: string) =>
  async ({ supabase, itens }: Pick<Contexto, "supabase" | "itens">) => {
    if (!itens.length) return;
    const { error } = await supabase.from(tabela).delete().in("origem_item_id", itens.map((i) => i.id));
    if (error) throw new Error("Não foi possível desfazer o que foi lançado.");
  };

// Cadastra (ou acha) o funcionário do item no cliente.
async function garantirFuncionario(supabase: SupabaseClient, clienteId: string, item: Item): Promise<string> {
  if (item.funcionario_id) return item.funcionario_id;
  const nome = texto(item.dados.funcionario_nome);
  const cpf = texto(item.dados.funcionario_cpf).replace(/\D/g, "") || null;
  const { data, error } = cpf
    ? await supabase.from("ponto_funcionarios").upsert({ cliente_id: clienteId, nome, cpf }, { onConflict: "cliente_id,cpf" }).select("id").single()
    : await supabase.from("ponto_funcionarios").insert({ cliente_id: clienteId, nome }).select("id").single();
  if (error || !data) throw new Error(`Não foi possível cadastrar ${nome}.`);
  await supabase.from("documentos_itens").update({ funcionario_id: data.id }).eq("id", item.id);
  return data.id;
}

// A guia que o comprovante paga: mesmo código de barras; senão (tributo ou
// boleto sem código) uma única guia em aberto com o mesmo valor e vencimento
// perto da data do pagamento.
async function guiaDoPagamento(supabase: SupabaseClient, clienteId: string, d: Dados): Promise<string | null> {
  const codigo = barra(d.codigo_barras);
  const abertas = () => supabase.from("guias").select("id").eq("cliente_id", clienteId).is("pago_em", null);
  if (codigo) {
    const { data } = await abertas().eq("codigo_barras", codigo).limit(1);
    if (data?.length) return data[0].id;
  }
  if (d.forma !== "tributo" && d.forma !== "boleto") return null;
  const pago = texto(d.data_pagamento);
  const { data } = await abertas()
    .eq("valor_total", valor(d.valor))
    .gte("vencimento", somarDias(pago, -45))
    .lte("vencimento", somarDias(pago, 45))
    .limit(2);
  return data?.length === 1 ? data[0].id : null;
}

const ACOES: Record<string, Acao> = {
  // Atestado → afastamento lançado (pessoal_afastamentos). O mesmo afastamento
  // (funcionário, tipo, início) não é lançado duas vezes.
  atestado: {
    async confirmar({ supabase, clienteId, itens }) {
      let lancados = 0;
      let repetidos = 0;
      for (const it of itens) {
        const funcionarioId = await garantirFuncionario(supabase, clienteId, it);
        const horas = it.dados.tipo_afastamento === "horas";
        const inicio = texto(it.dados.data_inicio);
        const dias = horas ? null : Number(it.dados.dias);
        const { data, error } = await supabase
          .from("pessoal_afastamentos")
          .upsert(
            {
              cliente_id: clienteId,
              funcionario_id: funcionarioId,
              tipo: horas ? "comparecimento" : "atestado",
              inicio,
              fim: horas ? inicio : somarDias(inicio, (dias ?? 1) - 1),
              dias,
              hora_inicio: horas ? texto(it.dados.hora_inicio) : null,
              hora_fim: horas ? texto(it.dados.hora_fim) : null,
              medico: texto(it.dados.medico_nome) || null,
              crm: texto(it.dados.crm) || null,
              origem_item_id: it.id,
            },
            { onConflict: "funcionario_id,tipo,inicio", ignoreDuplicates: true },
          )
          .select("id");
        if (error) throw new Error(`Não foi possível lançar o afastamento de ${texto(it.dados.funcionario_nome)}.`);
        if (data?.length) lancados++;
        else repetidos++;
      }
      return `${lancados} ${lancados === 1 ? "afastamento lançado" : "afastamentos lançados"}${repetidos ? ` · ${repetidos} já estava${repetidos === 1 ? "" : "m"} lançado${repetidos === 1 ? "" : "s"}` : ""}`;
    },
    async desfazer({ supabase, itens }) {
      if (itens.length) await supabase.from("pessoal_afastamentos").delete().in("origem_item_id", itens.map((i) => i.id));
    },
  },

  // NFS-e → fiscal_nfse, como prestada (cliente emitiu) ou tomada (cliente contratou).
  nfse: {
    async confirmar({ supabase, clienteId, clienteDocumento, itens }) {
      if (!clienteDocumento) throw new Error("O cliente não tem CNPJ/CPF no cadastro: não dá para saber se a nota é prestada ou tomada.");
      const linhas = itens.map((it) => {
        const d = it.dados;
        const prestador = digitos(d.prestador_documento);
        const tomador = digitos(d.tomador_documento) || null;
        const papel = mesmaEmpresa(prestador, clienteDocumento) ? "prestada" : tomador && mesmaEmpresa(tomador, clienteDocumento) ? "tomada" : null;
        if (!papel) throw new Error(`Nota nº ${texto(d.numero)}: o cliente não é o prestador nem o tomador.`);
        return {
          cliente_id: clienteId,
          papel,
          numero: texto(d.numero),
          codigo_verificacao: ouNulo(d.codigo_verificacao),
          emitida_em: texto(d.data_emissao),
          competencia: mesParaData(d.competencia),
          municipio: ouNulo(d.municipio),
          prestador_documento: prestador,
          prestador_nome: ouNulo(d.prestador_nome),
          tomador_documento: tomador,
          tomador_nome: ouNulo(d.tomador_nome),
          codigo_servico: ouNulo(d.codigo_servico),
          discriminacao: ouNulo(d.discriminacao),
          valor_servicos: valor(d.valor_servicos),
          deducoes: valor(d.deducoes),
          desconto_incondicionado: valor(d.desconto_incondicionado),
          base_calculo: valor(d.base_calculo),
          aliquota_iss: valor(d.aliquota_iss),
          valor_iss: valor(d.valor_iss),
          iss_retido: d.iss_retido === "sim",
          valor_pis: valor(d.valor_pis),
          valor_cofins: valor(d.valor_cofins),
          valor_csll: valor(d.valor_csll),
          valor_irrf: valor(d.valor_irrf),
          valor_inss: valor(d.valor_inss),
          valor_liquido: valor(d.valor_liquido),
          origem_item_id: it.id,
        };
      });
      const { data, error } = await supabase
        .from("fiscal_nfse")
        .upsert(linhas, { onConflict: "cliente_id,prestador_documento,numero", ignoreDuplicates: true })
        .select("papel");
      if (error) throw new Error("Não foi possível gravar as notas.");
      const gravadas = data ?? [];
      const prestadas = gravadas.filter((n) => n.papel === "prestada").length;
      const tomadas = gravadas.length - prestadas;
      const repetidas = linhas.length - gravadas.length;
      return (
        [
          prestadas && contagem(prestadas, "nota prestada", "notas prestadas"),
          tomadas && contagem(tomadas, "nota tomada", "notas tomadas"),
          repetidas && contagem(repetidas, "já estava gravada", "já estavam gravadas"),
        ]
          .filter(Boolean)
          .join(" · ") || "nenhuma nota nova"
      );
    },
    desfazer: apagarLancados("fiscal_nfse"),
  },

  // Guia → guias (fica em aberto até um comprovante dar a baixa).
  guia: {
    async confirmar({ supabase, clienteId, itens }) {
      const linhas = itens.map((it) => {
        const d = it.dados;
        return {
          cliente_id: clienteId,
          tipo: texto(d.tipo_guia) || "outro",
          contribuinte_documento: digitos(d.contribuinte_documento) || null,
          codigo_receita: ouNulo(d.codigo_receita),
          periodo: mesParaData(d.periodo_apuracao),
          vencimento: texto(d.vencimento),
          valor_principal: valor(d.valor_principal),
          valor_multa: valor(d.valor_multa),
          valor_juros: valor(d.valor_juros),
          valor_total: valor(d.valor_total),
          codigo_barras: barra(d.codigo_barras),
          numero_documento: ouNulo(d.numero_documento),
          origem_item_id: it.id,
        };
      });
      const { data, error } = await supabase
        .from("guias")
        .upsert(linhas, { onConflict: "cliente_id,tipo,codigo_barras", ignoreDuplicates: true })
        .select("id");
      if (error) throw new Error("Não foi possível gravar as guias.");
      const novas = (data ?? []).length;
      const repetidas = linhas.length - novas;
      return `${contagem(novas, "guia registrada", "guias registradas")}${repetidas ? ` · ${contagem(repetidas, "já estava registrada", "já estavam registradas")}` : ""}`;
    },
    desfazer: apagarLancados("guias"),
  },

  // Comprovante → contabil_comprovantes, ligado à guia que ele paga
  // (a guia fica com pago_em pelo trigger do banco).
  comprovante: {
    async confirmar({ supabase, clienteId, itens }) {
      let lancados = 0;
      let repetidos = 0;
      let baixas = 0;
      for (const it of itens) {
        const d = it.dados;
        const guiaId = await guiaDoPagamento(supabase, clienteId, d);
        const { data, error } = await supabase
          .from("contabil_comprovantes")
          .upsert(
            {
              cliente_id: clienteId,
              pago_em: texto(d.data_pagamento),
              valor: valor(d.valor),
              forma: texto(d.forma) || "outro",
              beneficiario_nome: ouNulo(d.beneficiario_nome),
              beneficiario_documento: digitos(d.beneficiario_documento) || null,
              pagador_nome: ouNulo(d.pagador_nome),
              pagador_documento: digitos(d.pagador_documento) || null,
              banco: ouNulo(d.banco),
              autenticacao: ouNulo(d.autenticacao),
              codigo_barras: barra(d.codigo_barras),
              descricao: ouNulo(d.descricao),
              guia_id: guiaId,
              origem_item_id: it.id,
            },
            { onConflict: "cliente_id,autenticacao", ignoreDuplicates: true },
          )
          .select("id");
        if (error) throw new Error(`Não foi possível gravar o comprovante de ${texto(d.beneficiario_nome) || "?"}.`);
        if (data?.length) {
          lancados++;
          if (guiaId) baixas++;
        } else repetidos++;
      }
      return [
        contagem(lancados, "comprovante lançado", "comprovantes lançados"),
        baixas && contagem(baixas, "guia baixada", "guias baixadas"),
        repetidos && contagem(repetidos, "já estava lançado", "já estavam lançados"),
      ]
        .filter(Boolean)
        .join(" · ");
    },
    desfazer: apagarLancados("contabil_comprovantes"),
  },
};

export const acaoDoTipo = (tipo: string): Acao | null => ACOES[tipo] ?? null;
