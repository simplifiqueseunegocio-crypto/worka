// CND estadual de SP (SIDEB) de um lote de clientes, numa só execução. Roda no
// Chrome do programador (javascript_tool), numa aba do SIDEB já logada em
// https://www4.fazenda.sp.gov.br/SIDEB/CertidaoNegativaDebitos/EmitirECND,
// depois de `window.__lista = <saída do fila.mjs reservar>`. Envia o mesmo
// formulário da página (com a sessão e o token dela), sem trocar de página, e
// deixa o resultado em window.__cnd.out, no formato do `node fila.mjs enviar`.
// Consulta pelo CNPJ base: clientes com a mesma base recebem o mesmo resultado.
// Ver rotina-estadual.md.

window.__cnd = { inicio: Date.now(), feito: 0, total: 0, fim: null, erro: null, out: null };
(async () => {
  const URL_FORM = "https://www4.fazenda.sp.gov.br/SIDEB/CertidaoNegativaDebitos/EmitirECND";
  const lista = window.__lista ?? [];
  window.__cnd.total = lista.length;
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  const pagina = async (resposta) => {
    const html = (resposta.headers.get("content-type") ?? "").includes("html") ? await resposta.text() : "";
    const doc = new DOMParser().parseFromString(html, "text/html");
    return { doc, texto: (doc.body?.textContent ?? "").replace(/\s+/g, " ") };
  };

  // Uma consulta: formulário novo (token novo) e envio. Devolve o resultado ou lança.
  async function consultar(doc) {
    const form = await fetch(URL_FORM, { credentials: "include" });
    const { doc: f, texto } = await pagina(form);
    const formEmitir = f.getElementById("formEmitir");
    if (!formEmitir) {
      if (/dias úteis|indispon/i.test(texto)) throw Object.assign(new Error("SIDEB fora do horário ou indisponível"), { parar: true });
      throw Object.assign(new Error("sessão do gov.br caiu"), { parar: true });
    }
    const dados = new FormData(formEmitir);
    const cpf = doc.length === 11;
    const opcao = [...formEmitir.querySelector("[name=tipoDocumento]").options].find((o) => (cpf ? /CPF/i : /CNPJ/i).test(o.text));
    dados.set("tipoDocumento", opcao.value);
    dados.set("cnpjBase", cpf ? "" : doc.slice(0, 8));
    dados.set("cpf", cpf ? doc : "");
    dados.set("numeroDocumento", cpf ? doc : doc.slice(0, 8));
    const resposta = await fetch(URL_FORM, { method: "POST", body: dados, credentials: "include" });
    const resultado = new URL(resposta.url).searchParams.get("resultado") ?? "";
    const { texto: t } = await pagina(resposta);
    if (/página não encontrada/i.test(t)) throw new Error("SIDEB: página não encontrada");
    // O parâmetro "resultado" do endereço decide; o texto só quando ele não vem.
    if (/^Negativa$/i.test(resultado)) return { status: "regular", mensagem: "eCND" };
    if (/efeito|CPEN/i.test(resultado)) return { status: "regular", mensagem: "eCPEN (positiva com efeito de negativa)" };
    if (/Positiva/i.test(resultado) || /Não foi possível emitir a Certidão/i.test(t)) return { status: "pendente", mensagem: "SIDEB não emitiu a certidão" };
    if (/emitida com sucesso/i.test(t)) return { status: "regular", mensagem: "eCND" };
    const aviso = /[^.]*(inválid|não encontrad|não cadastrad)[^.]*\.?/i.exec(t);
    if (aviso) return { status: "erro", mensagem: aviso[0].trim().slice(0, 500) };
    throw new Error("resposta inesperada do SIDEB");
  }

  const porBase = new Map();
  const resultados = [];
  let parar = "";
  let errosSeguidos = 0;
  for (const c of lista) {
    const doc = String(c.documento).replace(/\D/g, "");
    const chave = doc.length === 11 ? doc : doc.slice(0, 8);
    let r = porBase.get(chave);
    if (!r) {
      try {
        try {
          r = await consultar(doc);
        } catch (e) {
          if (e.parar || !/página não encontrada/.test(e.message)) throw e;
          await pausa(3000);
          r = await consultar(doc); // tenta uma vez mais
        }
        porBase.set(chave, r);
        errosSeguidos = 0;
      } catch (e) {
        if (e.parar) {
          parar = e.message;
          break;
        }
        r = { status: "erro", mensagem: `SIDEB: ${e.message}`, repetir: true };
        if (++errosSeguidos >= 2) parar = "2 erros seguidos do SIDEB";
      }
      await pausa(3000); // não sobrecarregar o site
    }
    resultados.push({ id: c.id, ...r });
    window.__cnd.feito++;
    if (parar) break;
  }
  window.__cnd.out = { resultados, parar };
  window.__cnd.fim = Date.now();
})().catch((e) => {
  window.__cnd.erro = String(e.message ?? e);
});
("iniciado");
