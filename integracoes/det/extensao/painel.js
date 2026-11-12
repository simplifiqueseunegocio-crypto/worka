// Painel "Robô do DET" no canto da guia do DET. A pessoa entra no DET como
// sempre (gov.br, certificado) e clica em "Ler a fila": o robô reserva as
// empresas na plataforma, lê a LISTA da Caixa Postal de cada uma nesta guia
// (det-caixa-postal.js) e devolve o resultado. Nunca abre mensagens.

(() => {
  if (window.__detPainel) return;
  window.__detPainel = true;

  const MCONT = "42549422000160"; // a matriz não aceita Procurador: lê pelo "Meu Perfil"
  const LOTE = 10;
  const TEMPO_LOTE = 12 * 60_000; // a reserva expira em 15 minutos
  const TEMPO_EMPRESA = 90_000;
  const E_CONSIGNADO = /consignad|cr[eé]dito do trabalhador|averba/i; // igual a det_e_consignado() no banco
  const MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
  const pad = (n) => String(n).padStart(2, "0");
  const hoje = () => new Date().toLocaleDateString("sv-SE");

  // -------------------------------------------------------------------------
  // Conversão do que a página leu

  // "21 out 26" → "2026-10-21"; "10:32" (mensagem de hoje) → hoje.
  function dataIso(s) {
    if (/^\d{1,2}:\d{2}$/.test(s)) return hoje();
    const m = /^(\d{1,2}) ([A-Za-zç]{3})\.? (\d{2}|\d{4})$/.exec(s);
    const mes = m && MESES[m[2].toLowerCase()];
    if (!mes) return null;
    const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${ano}-${pad(mes)}-${pad(m[1])}`;
  }

  // Aviso padrão do MTE enviado no mês M: averbação de 21/(M-1) a 20/M,
  // desconto na folha da competência M+1.
  function periodoPadrao(iso) {
    const [ano, mes] = iso.split("-").map(Number);
    const ant = mes === 1 ? [ano - 1, 12] : [ano, mes - 1];
    const prox = mes === 12 ? [ano + 1, 1] : [ano, mes + 1];
    return {
      periodo_averbacao: `21/${pad(ant[1])}/${ant[0]} a 20/${pad(mes)}/${ano}`,
      competencia_desconto: `${prox[0]}-${pad(prox[1])}`,
    };
  }

  function converterAvisos(itens) {
    return itens.flatMap((x) => {
      const data = dataIso(x.data);
      // O remetente "... Crédito do Trabalhador" vai junto quando só ele indica consignado.
      const assunto = !E_CONSIGNADO.test(x.assunto) && E_CONSIGNADO.test(x.remetente) ? `${x.assunto} (${x.remetente})` : x.assunto;
      if (!data || !assunto) return [];
      return [{ data, assunto: assunto.slice(0, 500), lida: x.lida, ...(E_CONSIGNADO.test(assunto) ? periodoPadrao(data) : {}) }];
    });
  }

  // Logado no DET: fora da tela de login e com o cabeçalho do empregador ou o botão Trocar Perfil.
  const logado = () =>
    !location.pathname.startsWith("/login") &&
    (/Empregador:/.test(document.body.innerText) || [...document.querySelectorAll("button")].some((b) => b.textContent.includes("Trocar Perfil")));

  async function lerEmpresa(documento) {
    const doc = String(documento).replace(/\D/g, "");
    const lido = await Promise.race([
      window.__detLer(doc, doc === MCONT),
      new Promise((r) => setTimeout(() => r({ erro: "passou de 90 s", temporario: true }), TEMPO_EMPRESA)),
    ]);
    if (lido.erro) {
      if (/n[aã]o existe procura[cç][aã]o/i.test(lido.erro)) return { status: "sem_procuracao", mensagem: lido.erro };
      if (/inv[aá]lid/i.test(lido.erro)) return { status: "erro", mensagem: `DET recusou o documento: ${lido.erro}` };
      if (!logado()) return { sessaoCaiu: true };
      return { status: "erro", mensagem: lido.erro, repetir: lido.temporario !== false };
    }
    if (!lido.documentoNoCabecalho.startsWith(doc)) {
      return { status: "erro", mensagem: `O DET mostrou outra empresa (${lido.empregador})`, repetir: true };
    }
    const avisos = converterAvisos(lido.itens);
    if (lido.itens.length && !avisos.length) {
      return { status: "erro", mensagem: `Lista lida, mas nenhuma data reconhecida (ex.: "${lido.itens[0].data}")` };
    }
    return { status: "concluida", avisos, naoLidas: lido.naoLidas };
  }

  // -------------------------------------------------------------------------
  // Plataforma (pela extensão, com a sessão de quem está logado nela)

  let plataforma = "";
  async function api(corpo) {
    const r = await chrome.runtime.sendMessage({ tipo: "api", plataforma, corpo });
    if (!r || r.status !== 200) throw new Error(r?.corpo?.erro ?? "Sem resposta da plataforma.");
    return r.corpo;
  }

  // -------------------------------------------------------------------------
  // Painel

  // Ícones (Lucide, os mesmos da plataforma).
  const svg = (d, t = 16) =>
    `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICONE = {
    robo: svg('<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>', 18),
    seta: svg('<path d="m6 9 6 6 6-6"/>'),
    play: svg('<polygon points="6 3 20 12 6 21 6 3" fill="currentColor"/>', 14),
    parar: svg('<rect width="14" height="14" x="5" y="5" rx="2" fill="currentColor"/>', 14),
    atualizar: svg('<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>', 14),
    link: svg('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>', 14),
    escudo: svg('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>', 14),
    usuario: svg('<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', 13),
  };

  // Montserrat, a fonte da plataforma (declarada na página; só o painel usa).
  if (!document.querySelector("link[data-robo-det]")) {
    const fonte = document.createElement("link");
    fonte.rel = "stylesheet";
    fonte.href = "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap";
    fonte.dataset.roboDet = "1";
    document.head.appendChild(fonte);
  }

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483647";
  const raiz = host.attachShadow({ mode: "closed" });
  raiz.innerHTML = `
    <style>
      :host{all:initial}
      *{box-sizing:border-box}
      [hidden]{display:none!important}
      .p{width:340px;font:13px/1.45 Montserrat,"Segoe UI",system-ui,sans-serif;color:#0d1b2a;background:#fff;border:1px solid #dce3eb;border-radius:18px;box-shadow:0 12px 40px rgba(13,27,42,.18),0 2px 6px rgba(13,27,42,.08);overflow:hidden;-webkit-font-smoothing:antialiased}
      .t{display:flex;align-items:center;gap:10px;padding:12px 14px;background:#003064;color:#fff;cursor:pointer;user-select:none}
      .ic{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;background:rgba(255,255,255,.12)}
      .nome{flex:1;display:flex;flex-direction:column;line-height:1.2}
      .nome b{font-size:14px;font-weight:700}
      .nome small{font-size:10.5px;font-weight:600;opacity:.7;letter-spacing:.12em}
      .tg{display:grid;place-items:center;transition:transform .2s;opacity:.8}
      .min .tg{transform:rotate(180deg)}
      .min .c{display:none}
      .min.p{width:auto;border-radius:999px}
      .min .t{padding:8px 14px 8px 8px}
      .c{padding:14px;display:flex;flex-direction:column;gap:12px}
      .fila{display:flex;align-items:center;gap:12px;padding:12px;border-radius:12px;background:#f4f6f9}
      .num{font-size:26px;font-weight:700;color:#003064;line-height:1;min-width:44px;text-align:center;font-variant-numeric:tabular-nums}
      .fila > div{display:flex;flex-direction:column;gap:2px;min-width:0}
      .st{font-weight:600;font-size:13px}
      .st.ok{color:#17603F}.st.er{color:#A4231A}
      .op{display:flex;align-items:center;gap:4px;color:#4a5868;font-size:12px}
      .barra{height:6px;border-radius:999px;background:#e8edf3;overflow:hidden}
      .barra i{display:block;height:100%;width:0;background:#003064;border-radius:999px;transition:width .3s}
      button{font:inherit;cursor:pointer;border:0}
      .acoes{display:flex;gap:8px}
      .ler,.parar{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;height:40px;border-radius:999px;font-weight:700;font-size:13px}
      .ler{background:#003064;color:#fff}.ler:hover:not(:disabled){background:#0d1b2a}
      .ler:disabled{background:#e8edf3;color:#8a96a5;cursor:default}
      .parar{background:#FBE3E1;color:#A4231A}.parar:hover{background:#f6d0cc}
      .nota{display:flex;gap:8px;font-size:11.5px;color:#4a5868;align-items:flex-start}
      .nota svg{flex:none;margin-top:1px;color:#17603F}
      .cfg{display:flex;flex-direction:column;gap:6px;padding:12px;border-radius:12px;background:#f4f6f9}
      .cfg label{font-size:12px;font-weight:600;color:#4a5868}
      .linha{display:flex;gap:6px}
      input{flex:1;min-width:0;font:inherit;font-size:12.5px;border:1px solid #dce3eb;border-radius:10px;padding:8px 10px;outline:none;color:#0d1b2a;background:#fff}
      input:focus{border-color:#003064;box-shadow:0 0 0 3px rgba(0,48,100,.12)}
      .salvar{padding:0 14px;border-radius:10px;background:#003064;color:#fff;font-weight:700}
      .rodape{display:flex;justify-content:space-between}
      .sec{display:flex;align-items:center;gap:5px;background:none;padding:2px 0;color:#003064;font-weight:600;font-size:12px}
      .sec:hover{color:#0d1b2a;text-decoration:underline}
      .log{display:flex;flex-direction:column;max-height:200px;overflow:auto;border-top:1px solid #e8edf3;margin:0 -14px -14px;padding:4px 0}
      .log::-webkit-scrollbar{width:6px}.log::-webkit-scrollbar-thumb{background:#dce3eb;border-radius:3px}
      .it{display:flex;gap:10px;padding:7px 14px;font-size:12px}
      .it:hover{background:#f4f6f9}
      .pt{flex:none;width:8px;height:8px;margin-top:5px;border-radius:50%;background:#8a96a5}
      .pt.ok{background:#17603F}.pt.av{background:#B54708}.pt.er{background:#A4231A}.pt.fim{background:#003064}
      .it div{min-width:0;flex:1}
      .it b{display:block;font-weight:600;color:#0d1b2a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .it span{color:#4a5868}
      .it time{flex:none;color:#8a96a5;font-size:11px;font-variant-numeric:tabular-nums}
    </style>
    <div class="p">
      <div class="t" title="Recolher / abrir">
        <span class="ic">${ICONE.robo}</span>
        <span class="nome"><b>Robô do DET</b><small>MCONT</small></span>
        <span class="tg">${ICONE.seta}</span>
      </div>
      <div class="c">
        <div class="cfg" hidden>
          <label for="url">Endereço da Plataforma MCONT</label>
          <div class="linha"><input id="url" class="url" placeholder="https://..."><button class="salvar">Salvar</button></div>
        </div>
        <div class="fila">
          <span class="num">–</span>
          <div><span class="st">Conferindo a plataforma…</span><span class="op" hidden>${ICONE.usuario}<span></span></span></div>
        </div>
        <div class="barra" hidden><i></i></div>
        <div class="acoes">
          <button class="ler" disabled>${ICONE.play}<span>Ler a fila</span></button>
          <button class="parar" hidden>${ICONE.parar}<span>Parar</span></button>
        </div>
        <div class="nota">${ICONE.escudo}<span>Só lê a lista da Caixa Postal; nunca abre mensagens. Deixe esta guia aberta e na frente enquanto lê.</span></div>
        <div class="rodape">
          <button class="sec trocar">${ICONE.link}Endereço</button>
          <button class="sec atualizar">${ICONE.atualizar}Atualizar</button>
        </div>
        <div class="log" hidden></div>
      </div>
    </div>`;
  document.documentElement.appendChild(host);
  const $ = (s) => raiz.querySelector(s);
  const status = (texto, classe = "") => {
    $(".st").className = `st ${classe}`;
    $(".st").textContent = texto;
  };
  const numero = (n) => ($(".num").textContent = n === null ? "–" : String(n));
  const operador = (nome) => {
    $(".op").hidden = !nome;
    $(".op span").textContent = nome ?? "";
  };
  const progresso = (feitas, total) => {
    $(".barra").hidden = !total;
    $(".barra i").style.width = total ? `${Math.min(100, (feitas / total) * 100)}%` : "0";
  };
  // tipo: ok (lida), av (sem procuração), er (erro), fim
  const registrar = (titulo, detalhe, tipo) => {
    const l = $(".log");
    l.hidden = false;
    const d = document.createElement("div");
    d.className = "it";
    d.innerHTML = `<i class="pt ${tipo}"></i><div><b></b><span></span></div><time></time>`;
    d.querySelector("b").textContent = titulo;
    d.querySelector("span").textContent = detalhe;
    d.querySelector("time").textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    l.prepend(d);
    while (l.children.length > 300) l.lastChild.remove();
  };
  $(".t").onclick = () => $(".p").classList.toggle("min");

  let rodando = false;
  let parar = false;

  async function conferir() {
    if (rodando) return;
    $(".ler").disabled = true;
    if (!plataforma) {
      $(".cfg").hidden = false;
      status("Informe o endereço da plataforma.");
      return;
    }
    try {
      const r = await api({ acao: "pendentes" });
      numero(r.pendentes);
      operador(r.operador);
      if (!r.pendentes) status('Fila vazia. Use "Iniciar" na plataforma.');
      else if (!logado()) status("na fila. Entre no DET nesta guia para ler.");
      else status(r.pendentes === 1 ? "empresa na fila" : "empresas na fila", "ok");
      $(".ler").disabled = !r.pendentes || !logado();
    } catch (e) {
      numero(null);
      status(e.message, "er");
    }
  }

  async function rodar() {
    rodando = true;
    parar = false;
    $(".ler").disabled = true;
    $(".parar").hidden = false;
    const total = { concluida: 0, sem_procuracao: 0, erro: 0, avisos_novos: 0, tarefas_criadas: 0 };
    let motivoParada = null;
    let feitas = 0;
    let previstas = Number($(".num").textContent) || 0;
    try {
      while (!parar && !motivoParada) {
        const { consultas } = await api({ acao: "reservar", limite: LOTE });
        if (!consultas.length) break;
        previstas = Math.max(previstas, feitas + consultas.length);
        const inicio = Date.now();
        const resultados = [];
        for (const c of consultas) {
          if (parar || motivoParada || Date.now() - inicio > TEMPO_LOTE) {
            resultados.push({ id: c.id, status: "erro", mensagem: "Não consultado: a leitura parou antes", devolver: true });
            continue;
          }
          status(`Lendo ${c.razao_social}…`);
          numero(Math.max(previstas - feitas, 0));
          progresso(feitas, previstas);
          let r;
          try {
            r = await lerEmpresa(c.documento);
          } catch (e) {
            r = { status: "erro", mensagem: `Falha na leitura: ${e.message}`, repetir: true };
          }
          if (r.sessaoCaiu) {
            motivoParada = "A sessão do DET caiu. Entre de novo e clique em Ler a fila.";
            resultados.push({ id: c.id, status: "erro", mensagem: "Não consultado: sessão do DET caiu", devolver: true });
            continue;
          }
          feitas++;
          resultados.push({ id: c.id, status: r.status, mensagem: r.mensagem, repetir: r.repetir === true, avisos: r.avisos ?? [] });
          total[r.status]++;
          if (r.status === "concluida") {
            const consig = r.avisos.filter((a) => E_CONSIGNADO.test(a.assunto)).length;
            registrar(c.razao_social, `${r.avisos.length} na 1ª página · ${consig} de consignado · ${r.naoLidas} não lidas`, "ok");
          } else {
            const semProc = r.status === "sem_procuracao";
            registrar(c.razao_social, semProc ? "Sem procuração no DET" : r.mensagem, semProc ? "av" : "er");
          }
        }
        const resumo = await api({ acao: "resultados", resultados });
        total.avisos_novos += resumo.avisos_novos ?? 0;
        total.tarefas_criadas += resumo.tarefas_criadas ?? 0;
      }
      progresso(feitas, previstas);
      const fim = `${total.concluida} lidas · ${total.sem_procuracao} sem procuração · ${total.erro} com erro · ${total.avisos_novos} avisos novos · ${total.tarefas_criadas} tarefas`;
      registrar(motivoParada ? "Leitura interrompida" : parar ? "Leitura parada" : "Leitura concluída", fim, motivoParada ? "er" : "fim");
      status(motivoParada ?? (parar ? "Parado." : "Pronto! Veja o resultado na plataforma."), motivoParada ? "er" : "ok");
    } catch (e) {
      status(`Parou: ${e.message}`, "er");
      registrar("Leitura interrompida", e.message, "er");
    } finally {
      rodando = false;
      $(".parar").hidden = true;
      setTimeout(() => progresso(0, 0), 4000);
      if (!motivoParada) setTimeout(conferir, 3000);
      else $(".ler").disabled = false;
    }
  }

  $(".ler").onclick = () => !rodando && rodar();
  $(".parar").onclick = () => {
    parar = true;
    status("Parando depois da empresa atual…");
  };
  $(".trocar").onclick = () => {
    $(".cfg").hidden = !$(".cfg").hidden;
    $(".url").value = plataforma;
  };
  $(".atualizar").onclick = conferir;
  const salvar = async () => {
    plataforma = $(".url").value.trim().replace(/\/+$/, "");
    await chrome.storage.local.set({ plataforma });
    $(".cfg").hidden = true;
    conferir();
  };
  $(".salvar").onclick = salvar;
  $(".url").onkeydown = (e) => e.key === "Enter" && salvar();
  window.addEventListener("beforeunload", (e) => {
    if (rodando) e.preventDefault();
  });

  chrome.storage.local.get("plataforma").then(({ plataforma: p }) => {
    plataforma = p ?? "";
    conferir();
  });
  // O DET carrega devagar depois do login: confere de novo quando aparecer.
  const espera = setInterval(() => {
    if (logado() && !rodando) {
      clearInterval(espera);
      conferir();
    }
  }, 3000);
})();
