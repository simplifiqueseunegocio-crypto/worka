// Certidão federal (Receita/PGFN) de um lote de clientes, numa só execução.
// Roda no navegador embutido do app (javascript_tool), numa aba já aberta em
// https://servicos.receitafederal.gov.br/servico/certidoes/#/home/cnpj,
// depois de `window.__lista = <saída do fila.mjs reservar>`. Preenche e clica
// no próprio formulário da página (o hCaptcha invisível do site roda como num
// clique normal) e deixa o resultado em window.__cnd.out, no formato do
// `node fila.mjs enviar`. Ver rotina-federal.md.

window.__cnd = { inicio: Date.now(), feito: 0, total: 0, fim: null, erro: null, out: null };
(async () => {
  const lista = window.__lista ?? [];
  window.__cnd.total = lista.length;
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  const esperar = async (cond, ms) => {
    for (let t = 0; t < ms; t += 500) {
      const v = cond();
      if (v) return v;
      await pausa(500);
    }
    return cond();
  };
  const botao = (rotulo) => [...document.querySelectorAll("button")].find((b) => rotulo.test(b.innerText.trim()) || rotulo.test(b.getAttribute("aria-label") ?? ""));
  const texto = () => document.body.innerText.replace(/\s+/g, " ");
  const setValor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  const formatar = (d) =>
    d.length === 11
      ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
      : d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  const captchaVisivel = () =>
    [...document.querySelectorAll('iframe[src*="hcaptcha"]')].some((f) => f.offsetWidth > 200 && f.offsetHeight > 200);
  // Frase do aviso que contém o termo (o ponto do CNPJ não encerra a frase).
  const frase = (tudo, re) => {
    const t = tudo.split("Resultado da Emissão de Certidão").pop(); // sem o banner de cookies
    const m = re.exec(t);
    if (!m) return "";
    const ini = t.lastIndexOf(". ", m.index);
    const fim = t.indexOf(". ", m.index);
    return t.slice(ini < 0 ? 0 : ini + 2, fim < 0 ? undefined : fim + 1).trim().slice(0, 500);
  };

  // A Receita só emite para a matriz ("A certidão deve ser emitida para o CNPJ
  // da matriz"): filial é consultada pelo CNPJ da matriz, que vale para todas.
  const dv = (b) => {
    let soma = 0;
    let peso = b.length - 7;
    for (const n of b) {
      soma += Number(n) * peso--;
      if (peso < 2) peso = 9;
    }
    return soma % 11 < 2 ? 0 : 11 - (soma % 11);
  };
  const daMatriz = (d) => {
    if (d.length !== 14 || d.slice(8, 12) === "0001") return d;
    const b = d.slice(0, 8) + "0001";
    const d1 = dv(b);
    return b + d1 + dv(b + d1);
  };
  const jaConsultados = new Map(); // CNPJ da matriz → resultado neste lote

  // HTTP 431: cookies HttpOnly do navegador + token do hCaptcha passam do limite
  // de cabeçalho da Receita. A página não consegue limpar esses cookies; só
  // limpando os dados do site no navegador (ou usando outro navegador).
  let status431 = false;
  const abrir = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) {
    this.addEventListener("loadend", () => { if (this.status === 431) status431 = true; });
    return abrir.apply(this, arguments);
  };

  const resultados = [];
  let parar = "";
  let errosSeguidos = 0;
  for (const c of lista) {
    const original = String(c.documento).replace(/\D/g, "");
    const doc = daMatriz(original);
    const rota = doc.length === 11 ? "#/home/cpf" : "#/home/cnpj";
    let r;
    if (jaConsultados.has(doc)) {
      resultados.push({ id: c.id, ...jaConsultados.get(doc) });
      window.__cnd.feito++;
      continue;
    }
    try {
      botao(/^Fechar$/)?.click();
      if (location.hash !== rota) location.hash = rota;
      const campo = await esperar(() => document.querySelector("input[name=niContribuinte]"), 15000);
      if (!campo) throw new Error("formulário não carregou");
      setValor.call(campo, formatar(doc));
      campo.dispatchEvent(new Event("input", { bubbles: true }));
      await pausa(300);
      botao(/^Emitir Certidão$/).click();
      status431 = false;
      const fim = await esperar(() => {
        if (status431) return "431";
        if (captchaVisivel()) return "captcha";
        const t = texto();
        if (/Certidão Válida Encontrada/.test(t)) return "valida";
        if (/\/resultado/.test(location.hash) && !/Carregando/.test(t)) return "resultado";
        if (/inválid|inexistente|baixad|inapta|não permitida|CNPJ da matriz/i.test(t)) return "aviso";
        return null;
      }, 30000);
      await pausa(1000);
      const t = texto();
      if (fim === "captcha") {
        parar = "captcha visível na Receita";
        break;
      } else if (fim === "431") {
        parar = "Receita recusou o pedido (HTTP 431: cookies do navegador grandes demais; limpe os dados do site ou use o Chrome)";
        break;
      } else if (fim === "valida") r = { status: "regular", mensagem: "Já existe certidão válida na Receita" };
      else if (/insuficientes para emitir/i.test(t)) r = { status: "pendente", mensagem: "Receita não emitiu a certidão (informações insuficientes)" };
      else if (/Positiva com Efeitos de Negativa/i.test(t)) r = { status: "regular", mensagem: "Positiva com efeitos de negativa" };
      else if (/inválid|inexistente|baixad|inapta|não permitida|CNPJ da matriz/i.test(t))
        r = { status: "erro", mensagem: frase(t, /inválid|inexistente|baixad|inapta|não permitida|CNPJ da matriz/i) };
      else if (fim === "resultado" && /Negativa|emitida/i.test(t)) r = { status: "regular", mensagem: /Negativa/i.test(t) ? "Negativa" : "Certidão emitida" };
      else if (fim) r = { status: "erro", mensagem: (t.split("Resultado da Emissão de Certidão").pop() ?? t).slice(0, 300) };
      else throw new Error("sem resposta em 30 s");
      if (doc !== original) r.mensagem = `${r.mensagem ?? "Regular"} (certidão da matriz ${formatar(doc)})`;
      jaConsultados.set(doc, r);
      errosSeguidos = 0;
    } catch (e) {
      r = { status: "erro", mensagem: `Receita: ${e.message}`, repetir: true };
      if (++errosSeguidos >= 2) parar = "2 erros seguidos do site da Receita";
    }
    resultados.push({ id: c.id, ...r });
    window.__cnd.feito++;
    if (parar) break;
    botao(/^Fechar$/)?.click();
    botao(/Nova Consulta/)?.click();
    await pausa(3000); // não sobrecarregar o site
  }
  window.__cnd.out = { resultados, parar };
  window.__cnd.fim = Date.now();
})().catch((e) => {
  window.__cnd.erro = String(e.message ?? e);
});
("iniciado");
