// Regularidade do FGTS (CRF da Caixa) de um lote de clientes, numa só execução.
// Roda no Chrome (javascript_tool), numa aba já aberta em
// https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf,
// depois de `window.__lista = <saída do fila.mjs reservar>`. Usa o próprio
// formulário da página (a consulta é AJAX, a página não recarrega) e deixa o
// resultado em window.__cnd.out, no formato do `node fila.mjs enviar`.
// Ver rotina-fgts.md.

window.__cnd = { inicio: Date.now(), feito: 0, total: 0, fim: null, erro: null, out: null };
(async () => {
  const lista = window.__lista ?? [];
  window.__cnd.total = lista.length;
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);
  const texto = () => document.body.innerText.replace(/\s+/g, " ");
  const esperar = async (cond, ms) => {
    for (let t = 0; t < ms; t += 500) {
      if (cond()) return true;
      await pausa(500);
    }
    return cond();
  };
  // Frase do aviso da Caixa, sem o cabeçalho da página.
  const aviso = (t) => (t.split("Situação de Regularidade do Empregador")[1] ?? t).split(/Inscrição:/)[0].trim().slice(0, 500);
  const SEM_VERIFICAR = /Não foi possível verificar a regularidade/i;

  // Consulta um documento no formulário e devolve o texto da página.
  const consultar = async (doc) => {
    if ($("mainForm:btnVoltar")) {
      $("mainForm:btnVoltar").click();
      await esperar(() => $("mainForm:txtInscricao1"), 15000);
    }
    if (!$("mainForm:txtInscricao1")) throw new Error("formulário não carregou");
    $("mainForm:tipoEstabelecimento").value = doc.length === 11 ? "3" : "1";
    $("mainForm:txtInscricao1").value = doc;
    $("mainForm:btnConsultar").click();
    // O primeiro clique às vezes não envia: tenta mais uma vez.
    if (!(await esperar(() => !$("mainForm:btnConsultar"), 15000)) && !/inválid|não encontrad/i.test(texto())) {
      $("mainForm:btnConsultar")?.click();
      await esperar(() => !$("mainForm:btnConsultar"), 15000);
    }
    return texto();
  };

  const resultados = [];
  let parar = "";
  let errosSeguidos = 0;
  let semVerificar = 0;
  let controle = ""; // documento já regular neste lote, para testar se a Caixa caiu
  for (const c of lista) {
    const doc = String(c.documento).replace(/\D/g, "");
    let r;
    try {
      if (/ShieldSquare|captcha/i.test(texto())) {
        parar = "captcha da Caixa";
        break;
      }
      const t = await consultar(doc);
      if (/ShieldSquare|captcha/i.test(t)) {
        parar = "captcha da Caixa";
        break;
      } else if (/est[aá] REGULAR no FGTS/i.test(t)) {
        r = { status: "regular", mensagem: null };
        controle = doc;
      } else if (SEM_VERIFICAR.test(t)) {
        // Para alguns CNPJs a Caixa responde isso sempre (orienta procurar uma
        // agência): é o resultado do cliente. Só é instabilidade se um
        // documento que já deu regular neste lote também receber a mensagem;
        // aí o lote para e os seguidos saem dos resultados, para o `enviar`
        // devolvê-los à fila sem gastar tentativa.
        if (++semVerificar >= 3 && controle) {
          await pausa(3000);
          if (SEM_VERIFICAR.test(await consultar(controle))) {
            resultados.splice(resultados.length - (semVerificar - 1), semVerificar - 1);
            parar = "Caixa instável (não foi possível verificar)";
            break;
          }
          semVerificar = 0;
        }
        r = { status: "erro", mensagem: "Caixa não verificou a regularidade e orienta procurar uma agência" };
      } else if (/não são suficientes|irregular|impedimento|débito|pendência/i.test(t)) r = { status: "pendente", mensagem: aviso(t) };
      else if ($("mainForm:btnConsultar")) {
        const msg = /[^.]*(inválid|não encontrad)[^.]*\.?/i.exec(t);
        if (!msg) throw new Error("sem resposta da Caixa");
        r = { status: "erro", mensagem: msg[0].trim() };
      } else r = { status: "erro", mensagem: aviso(t) };
      if (!SEM_VERIFICAR.test(t)) semVerificar = 0;
      errosSeguidos = 0;
    } catch (e) {
      r = { status: "erro", mensagem: `Caixa: ${e.message}`, repetir: true };
      if (++errosSeguidos >= 2) parar = "2 erros seguidos do site da Caixa";
    }
    resultados.push({ id: c.id, ...r });
    window.__cnd.feito++;
    sessionStorage.setItem("__cnd_out", JSON.stringify({ resultados, parar }));
    if (parar) break;
    await pausa(3000); // não sobrecarregar o site
  }
  window.__cnd.out = { resultados, parar };
  sessionStorage.setItem("__cnd_out", JSON.stringify(window.__cnd.out));
  window.__cnd.fim = Date.now();
})().catch((e) => {
  window.__cnd.erro = String(e.message ?? e);
});
("iniciado");
