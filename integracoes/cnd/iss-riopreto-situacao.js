// Situação municipal (ISS Digital de Rio Preto) de todos os cadastros vinculados
// ao contador do login, numa só execução. Roda no Chrome, dentro de uma aba do
// ISS Digital já logada (javascript_tool), e usa a mesma API da página:
//   api/iss_digital/buscaVinculos              lista "Meus Cadastros"
//   api/iss_digital/buscarDebitos?cadastro=N   parcelas em aberto do ano
// Pendente = débito de anos anteriores (outrosDebitos > 0) ou parcela do ano
// vencida. Leva ~1 minuto: corre em segundo plano e deixa o resultado em
// window.__cnd (ver rotina-municipal.md). O resultado é o arquivo do
// `node fila.mjs gravar municipal`.

window.__cnd = { inicio: Date.now(), feito: 0, total: 0, fim: null, erro: null, out: null };
(async () => {
  const API = "https://cidadao.riopreto.sp.gov.br/empro_cidadao/sjriopreto/semfaz/empro_riopreto_digital.php/api/iss_digital/";
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const data = (s) => {
    const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(s || "");
    return m ? new Date(+m[3], m[2] - 1, +m[1]) : null;
  };
  const json = (url) =>
    fetch(API + url).then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });

  const vinculos = await json("buscaVinculos");
  if (!Array.isArray(vinculos) || !vinculos.length) throw new Error("buscaVinculos não devolveu a lista de cadastros (sessão caiu?)");
  window.__cnd.total = vinculos.length;

  const porDoc = {};
  for (const c of vinculos) {
    const doc = String(c.cnpj_cpf || "").replace(/\D/g, "");
    const cad = String(c.nr_cadastro_iss || "").trim();
    const anteriores = Number(String(c.outrosDebitos || "0").replace(",", ".")) || 0;
    const s = (porDoc[doc] ??= { pendente: [], repetir: [] });
    window.__cnd.feito++;
    if (anteriores > 0) {
      s.pendente.push(`${anteriores} débito(s) de anos anteriores no cadastro ${cad}`);
      continue;
    }
    try {
      const vencidas = (await json("buscarDebitos?cadastro=" + encodeURIComponent(cad))).filter((p) => data(p.dat_vencimento) < hoje);
      if (vencidas.length) {
        s.pendente.push(
          `Parcela(s) vencida(s) do ano no cadastro ${cad}: ` +
            vencidas.map((p) => `${p.dat_vencimento} ${p.tipo_imposto} R$ ${p.vlr_prestacao}`).join("; "),
        );
      }
    } catch (e) {
      s.repetir.push(`ISS Digital: débitos do cadastro ${cad} não carregaram (${e.message})`);
    }
    await pausa(300); // não sobrecarregar o site
  }

  const out = {
    regular: [],
    pendente: {},
    repetir: {},
    ausente: ["erro", "Fora do ISS Digital: cliente de outro município ou não vinculado ao contador na prefeitura de Rio Preto"],
  };
  for (const [doc, s] of Object.entries(porDoc)) {
    if (s.pendente.length) out.pendente[doc] = s.pendente.join(" | ").slice(0, 1900);
    else if (s.repetir.length) out.repetir[doc] = s.repetir.join(" | ");
    else out.regular.push(doc);
  }
  window.__cnd.out = out;
  window.__cnd.fim = Date.now();
})().catch((e) => {
  window.__cnd.erro = String(e.message ?? e);
});
("iniciado");
