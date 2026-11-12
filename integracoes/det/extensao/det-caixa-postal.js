// Roda DENTRO da página do DET (det.sit.trabalho.gov.br), como parte da
// extensão. Define window.__detLer(doc, meuPerfil): troca o perfil para a
// empresa (Procurador → CNPJ/CPF → Selecionar), abre a Caixa Postal e lê só a
// LISTA da 1ª página.
//
// NUNCA clica numa mensagem: abrir registra ciência no DET (efeito legal).
// Os únicos cliques são: "Trocar Perfil", a opção do perfil, "Selecionar" e o
// card "CAIXA POSTAL" na tela de serviços.
//
// Fluxo validado à mão (skill det-consignado). Se o DET mudar a tela, é aqui
// que se ajusta.

window.__detLer = async function (doc, meuPerfil) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, t = 15000) => {
    const s = Date.now();
    while (Date.now() - s < t) {
      const v = fn();
      if (v) return v;
      await sleep(250);
    }
    return null;
  };
  const txt = () => document.querySelector("main")?.innerText || document.body.innerText;
  const docDoCabecalho = () => ((txt().match(/Empregador:\s*([^\n]+)/) || [])[1] || "").replace(/\D/g, "");
  const fecharJanela = () => document.querySelector("[role=dialog] button[aria-label=Fechar]")?.click();
  const naCaixaPostal = () => /Para visualizar uma mensagem/.test(txt());

  fecharJanela();
  if (!location.pathname.startsWith("/servicos")) {
    history.pushState({}, "", "/servicos");
    dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    await sleep(1500);
  }

  // 1. Trocar o perfil.
  const trocar = await waitFor(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Trocar Perfil")));
  if (!trocar) return { erro: "O botão Trocar Perfil não apareceu", temporario: true };
  trocar.click();
  const dlg = await waitFor(() => document.querySelector("[role=dialog]"));
  if (!dlg) return { erro: "A janela Trocar Perfil não abriu", temporario: true };
  dlg.querySelector(".ng-select-container")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  await sleep(500);
  const alvo = meuPerfil ? /^meu perfil$/i : /^procurador$/i;
  const opcao = await waitFor(() => [...document.querySelectorAll(".ng-option")].find((e) => alvo.test(e.textContent.trim())), 8000);
  if (!opcao) {
    const opcoes = [...document.querySelectorAll(".ng-option")].map((e) => e.textContent.trim()).join(", ");
    fecharJanela();
    return { erro: `Perfil ${meuPerfil ? "Meu Perfil" : "Procurador"} não está na lista (opções: ${opcoes || "nenhuma"})`, temporario: true };
  }
  opcao.click();
  await sleep(500);

  if (!meuPerfil) {
    const campo = [...dlg.querySelectorAll("input")].find((i) => /CNPJ/i.test(i.placeholder));
    if (!campo) {
      fecharJanela();
      return { erro: "Campo de CNPJ/CPF não apareceu", temporario: true };
    }
    campo.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(campo, doc);
    for (const e of ["input", "change", "blur"]) campo.dispatchEvent(new Event(e, { bubbles: true }));
    await sleep(400);
  }
  const selecionar = [...dlg.querySelectorAll("button")].find((b) => b.textContent.trim() === "Selecionar");
  if (!selecionar) {
    fecharJanela();
    return { erro: "Botão Selecionar não apareceu", temporario: true };
  }
  selecionar.click();

  const trocou = await waitFor(() => {
    if (docDoCabecalho().startsWith(doc)) return "ok";
    const alerta = document.querySelector(".br-message, [role=alert], .text-danger, .feedback.danger, .toast, .br-toast");
    if (alerta && alerta.innerText.trim()) return "erro";
    return null;
  }, 12000);
  if (trocou !== "ok") {
    const d = document.querySelector("[role=dialog]");
    const alerta = document.querySelector(".br-message, [role=alert], .text-danger, .feedback.danger, .toast, .br-toast");
    const msg = ((alerta && alerta.innerText.trim()) || (d && d.innerText) || "tempo esgotado ao trocar o perfil").replace(/\s+/g, " ").slice(0, 300);
    fecharJanela();
    return { erro: msg, temporario: trocou !== "erro" };
  }

  // 2. Abrir a Caixa Postal pelo card da tela de serviços (nunca dentro da lista).
  if (naCaixaPostal()) {
    history.pushState({}, "", "/servicos");
    dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    await sleep(1500);
  }
  const card = await waitFor(() =>
    [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && e.textContent.trim().toUpperCase() === "CAIXA POSTAL"),
  );
  if (!card || naCaixaPostal()) return { erro: "O card Caixa Postal não apareceu", temporario: true };
  (card.closest("a,button,[role=button],div.card,.br-card") || card).click();
  const abriu = await waitFor(() => /Caixa de Entrada \(\d+\)/.test(txt()) && naCaixaPostal(), 20000);
  if (!abriu) return { erro: "A Caixa Postal não carregou", temporario: true };
  await sleep(800);

  // 3. Ler a lista (só texto da página; nenhum clique daqui em diante).
  const t = txt();
  const empregador = (t.match(/Empregador:\s*([^\n]+)/) || [])[1] || "";
  const naoLidas = Number((t.match(/Caixa de Entrada \((\d+)\)/) || [])[1] || 0);
  const total = Number((t.match(/de (\d+) itens/) || [])[1] || 0) || null;

  const raiz = document.querySelector("main") || document.body;
  const reData = /^(\d{1,2}) ([A-Za-zç]{3})\.? (\d{2}|\d{4})$/;
  const reHora = /^\d{1,2}:\d{2}$/;
  const datas = [...raiz.querySelectorAll("*")].filter((e) => {
    if (e.children.length) return false;
    const s = e.textContent.trim();
    return reData.test(s) || reHora.test(s);
  });
  const contem = (el) => datas.filter((d) => el.contains(d)).length;
  const peso = (el) => {
    let max = 0;
    for (const e of [el, ...el.querySelectorAll("*")]) {
      if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      max = Math.max(max, Number(getComputedStyle(e).fontWeight) || 400);
    }
    return max;
  };
  const marcaClasse = (el) => {
    const classes = [el, ...el.querySelectorAll("*")].map((e) => (typeof e.className === "string" ? e.className : "")).join(" ");
    if (/n[aã]o-?lid|unread|nao_lid/i.test(classes)) return false;
    if (/(^|[\s_-])(lida|read)([\s_-]|$)/i.test(classes)) return true;
    return null;
  };

  const vistos = new Set();
  const itens = [];
  for (const d of datas) {
    let linha = d;
    while (linha.parentElement && linha.parentElement !== raiz && contem(linha.parentElement) === 1) linha = linha.parentElement;
    if (vistos.has(linha)) continue;
    vistos.add(linha);
    const partes = linha.innerText.split("\n").map((s) => s.trim()).filter(Boolean);
    const i = partes.indexOf(d.textContent.trim());
    const antes = partes.slice(0, Math.max(i, 0));
    const depois = i >= 0 ? partes.slice(i + 1) : [];
    const assunto = depois.join(" ") || antes.slice(-1)[0] || "";
    const remetente = depois.length ? antes.join(" ") : antes.slice(0, -1).join(" ");
    if (!assunto) continue;
    itens.push({ data: d.textContent.trim(), remetente, assunto, peso: peso(linha), classe: marcaClasse(linha) });
  }

  // Lida ou não: pela classe da linha; senão pelo negrito (não lidas em negrito
  // quando há pesos diferentes); senão pelo contador da Caixa de Entrada.
  const pesos = new Set(itens.map((x) => x.peso));
  const maisForte = Math.max(...pesos);
  for (const x of itens) {
    if (x.classe !== null) x.lida = x.classe;
    else if (pesos.size > 1) x.lida = x.peso < maisForte;
    else if (naoLidas === 0) x.lida = true;
    else if (naoLidas >= itens.length) x.lida = false;
    else x.lida = null;
    delete x.peso;
    delete x.classe;
  }

  return { empregador, documentoNoCabecalho: docDoCabecalho(), naoLidas, total, itens };
};
