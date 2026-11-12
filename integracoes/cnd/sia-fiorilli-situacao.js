// CND municipal nas prefeituras que usam o SIA da Fiorilli (Portal de Serviços,
// .../servicosweb/home.jsf), para um lote de clientes de UMA cidade, numa só
// execução. Roda no navegador embutido do app (javascript_tool), numa aba já
// aberta no home.jsf da prefeitura, depois de
// `window.__lista = <saída do fila.mjs reservar>`. Consulta pública, sem login:
// módulo Contribuinte → CPF/CNPJ → "Débitos em aberto". Trabalha num iframe da
// mesma página (as consultas navegam sem derrubar o script) e recarrega o
// home.jsf antes de cada cliente, para a sessão trocar de contribuinte.
// Deixa o resultado em window.__cnd.out, no formato do `node fila.mjs enviar`.
// Ver rotina-municipal-sia.md.

window.__cnd = { inicio: Date.now(), feito: 0, total: 0, fim: null, erro: null, out: null };
(async () => {
  const lista = window.__lista ?? [];
  window.__cnd.total = lista.length;
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  const BASE = location.pathname.replace(/\/servicosweb\/.*$/, "") + "/servicosweb";
  const HOME = BASE + "/home.jsf";
  // Páginas do contribuinte. Alguns portais em https (Sales) redirecionam para
  // http depois do OK; o navegador bloqueia (conteúdo misto) e o script abre a
  // mesma página pelo endereço da aba. A sessão já guardou o contribuinte.
  const PAGINA_CONTRIBUINTE = BASE + "/paginas/public/contribuinte/formContribuinte.jsf";
  const PAGINA_DEBITOS = BASE + "/paginas/public/contribuinte/formDebitos.jsf";
  const cidade = (/^\s*([^,]+?)\s*,/.exec(document.body.innerText) ?? [])[1] ?? location.host; // "JACI-SP"
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const data = (s) => {
    const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(s ?? "");
    return m ? new Date(+m[3], m[2] - 1, +m[1]) : null;
  };
  // Cor da bolinha da coluna "Sit" (legenda da própria página).
  const SITUACAO = { blue: "protestada", grey: "suspensa", green: "do exercício", yellow: "dívida ativa", red: "ajuizada" };

  const quadro = document.createElement("iframe");
  quadro.style.cssText = "width:1000px;height:600px;position:fixed;right:0;bottom:0;z-index:99999;background:#fff;border:2px solid #999";
  document.body.appendChild(quadro);
  const doc = () => quadro.contentDocument;
  const texto = () => (doc()?.body?.innerText ?? "").replace(/\s+/g, " ");
  // Executa a ação e espera o iframe carregar a próxima página.
  const navegar = (acao, ms = 20000) =>
    new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), ms);
      quadro.addEventListener("load", () => { clearTimeout(t); resolve(true); }, { once: true });
      acao();
    });
  const esperar = async (cond, ms) => {
    for (let t = 0; t < ms; t += 500) {
      const v = cond();
      if (v) return v;
      await pausa(500);
    }
    return cond();
  };
  const link = (re) => [...doc().querySelectorAll("a")].find((a) => re.test(a.innerText.trim()));
  const captcha = () => /captcha/i.test(texto()) || !!doc()?.querySelector('iframe[src*="captcha"], .g-recaptcha, .h-captcha');

  async function consultar(documento) {
    if (!(await navegar(() => { quadro.src = HOME + "?t=" + Date.now(); }))) throw new Error("página inicial não carregou");
    if (captcha()) throw Object.assign(new Error("captcha no SIA"), { parar: true });
    const modulo = link(/^Contribuinte$/);
    if (!modulo) throw Object.assign(new Error("módulo Contribuinte não existe nesta prefeitura"), { parar: true });
    modulo.click();
    const pj = documento.length === 14;
    const radio = await esperar(() => doc().getElementById(`compInformarContribuinte:formNumero:radioCadastroTipoPessoa:${pj ? 1 : 0}`), 10000);
    if (!radio) throw new Error("formulário do contribuinte não abriu");
    await pausa(1500); // a máscara do campo é ligada depois que o formulário aparece
    if (!radio.checked) {
      radio.click();
      radio.dispatchEvent(new Event("change", { bubbles: true }));
      await pausa(2000); // o campo é redesenhado com a máscara do tipo
    }
    // O formulário volta preenchido com o documento da consulta anterior: apaga antes.
    const campo = doc().getElementById("compInformarContribuinte:formNumero:itIdent");
    for (let tentativa = 0; tentativa < 3 && campo.value.replace(/\D/g, "") !== documento; tentativa++) {
      campo.focus();
      campo.setSelectionRange(0, campo.value.length);
      doc().execCommand("delete");
      if (campo.value.replace(/\D/g, "")) {
        campo.value = "";
        campo.dispatchEvent(new Event("input", { bubbles: true }));
      }
      doc().execCommand("insertText", false, documento);
      await pausa(300);
    }
    if (campo.value.replace(/\D/g, "") !== documento) throw new Error(`campo CPF/CNPJ não aceitou o documento (${campo.value})`);
    const entrou = await navegar(() => doc().getElementById("compInformarContribuinte:formNumero:btnValidar").click(), 15000);
    if (!entrou) {
      const aviso = (doc().getElementById("compInformarContribuinte:formNumero:mensagens")?.innerText ?? "").trim();
      if (aviso) return { status: "erro", mensagem: `${cidade}: ${aviso.slice(0, 300)}` };
      if (!(await navegar(() => { quadro.src = PAGINA_CONTRIBUINTE; }))) throw new Error("sem resposta ao informar o CPF/CNPJ");
    }
    // Confere que a página é do contribuinte pedido (e não o da consulta anterior).
    const naPagina = (/CPF\/CNPJ:\s*([\d./-]+)/.exec(texto()) ?? [])[1]?.replace(/\D/g, "");
    if (naPagina !== documento) throw new Error(`a página mostrou outro contribuinte (${naPagina ?? "nenhum"})`);
    if (/Cadastro:\s*NÃO CONSTA|Não consta nos cadastros/i.test(texto())) {
      return { status: "erro", mensagem: `Não consta nos cadastros da prefeitura (${cidade})` };
    }
    const debitos = link(/^DÉBITOS EM ABERTO$/i);
    if (!debitos) throw new Error("opção Débitos em aberto não apareceu");
    if (!(await navegar(() => debitos.click(), 15000)) && !(await navegar(() => { quadro.src = PAGINA_DEBITOS; }))) {
      throw new Error("débitos em aberto não carregaram");
    }
    const naLista = (/CPF\/CNPJ:\s*([\d./-]+)/.exec(texto()) ?? [])[1]?.replace(/\D/g, "");
    if (naLista && naLista !== documento) throw new Error(`a lista de débitos é de outro contribuinte (${naLista})`);
    // A tabela carrega depois da página (lazyLoadingPanel).
    const pronto = await esperar(() => {
      const d = doc();
      if (d.querySelector("tr[data-ri]")) return "tabela";
      if (/não possui débitos|nenhum débito|nenhum registro/i.test(texto())) return "sem débitos";
      if (d.querySelector(".ui-datatable-empty-message")) return "sem débitos";
      return null;
    }, 20000);
    if (!pronto) throw new Error("lista de débitos não apareceu");
    if (pronto === "sem débitos") return { status: "regular", mensagem: null };

    const tabela = doc().querySelector("tr[data-ri]").closest("table");
    const cab = [...tabela.querySelectorAll("thead th")].map((th) => th.innerText.trim());
    const col = (nome) => cab.findIndex((c) => c === nome);
    const [iVenc, iTrib, iAno, iTotal] = [col("Venc"), col("Tributo"), col("Ano"), col("Vl Total")];
    if (iVenc < 0) throw new Error("coluna Venc não encontrada na lista de débitos");
    const parcelas = [...tabela.querySelectorAll("tbody tr[data-ri]")].map((tr) => {
      const c = [...tr.cells].map((td) => td.innerText.trim());
      const cor = (/bullet-(\w+)_16/.exec(tr.cells[col("Sit")]?.innerHTML ?? "") ?? [])[1] ?? "";
      return { venc: data(c[iVenc]), vencTxt: c[iVenc], tributo: c[iTrib], ano: c[iAno], total: c[iTotal], situacao: SITUACAO[cor] ?? cor };
    });
    // Pendente = parcela vencida que não está suspensa. Parcelas a vencer não contam.
    const vencidas = parcelas.filter((p) => p.venc && p.venc < hoje && p.situacao !== "suspensa");
    const suspensas = parcelas.filter((p) => p.situacao === "suspensa").length;
    const paginado = !!doc().querySelector(".ui-paginator .ui-paginator-next:not(.ui-state-disabled)");
    if (!vencidas.length) {
      if (paginado) throw new Error("lista de débitos tem mais páginas e a primeira não tem vencidas");
      const extra = [];
      const aVencer = parcelas.length - suspensas;
      if (aVencer) extra.push(`${aVencer} parcela(s) a vencer`);
      if (suspensas) extra.push(`${suspensas} parcela(s) suspensa(s)`);
      return { status: "regular", mensagem: extra.length ? `Sem débito vencido (${extra.join(", ")})` : null };
    }
    const grupos = new Map();
    for (const p of vencidas) {
      const chave = `${p.tributo} ${p.ano} (${p.situacao})`;
      grupos.set(chave, (grupos.get(chave) ?? 0) + 1);
    }
    const resumo = [...grupos].map(([k, n]) => `${k}: ${n}`).join("; ");
    return {
      status: "pendente",
      mensagem: `${vencidas.length} parcela(s) vencida(s) na prefeitura (${cidade}): ${resumo}${paginado ? "; há mais páginas" : ""}`.slice(0, 1900),
    };
  }

  const jaConsultados = new Map(); // documento → resultado neste lote
  const resultados = [];
  window.__cnd.parcial = resultados; // o robô aproveita o que já leu se o lote passar do tempo
  let parar = "";
  let errosSeguidos = 0;
  for (const c of lista) {
    const documento = String(c.documento).replace(/\D/g, "");
    let r = jaConsultados.get(documento);
    if (!r) {
      try {
        r = await consultar(documento);
        jaConsultados.set(documento, r);
        errosSeguidos = 0;
      } catch (e) {
        if (e.parar) {
          parar = `${cidade}: ${e.message}`;
          break;
        }
        r = { status: "erro", mensagem: `SIA ${cidade}: ${e.message}`, repetir: true };
        if (++errosSeguidos >= 2) parar = `2 erros seguidos do SIA (${cidade})`;
      }
      await pausa(2000); // não sobrecarregar o site
    }
    resultados.push({ id: c.id, ...r });
    window.__cnd.feito++;
    if (parar) break;
  }
  quadro.remove();
  window.__cnd.out = { resultados, parar };
  window.__cnd.fim = Date.now();
})().catch((e) => {
  window.__cnd.erro = String(e.message ?? e);
});
("iniciado");
