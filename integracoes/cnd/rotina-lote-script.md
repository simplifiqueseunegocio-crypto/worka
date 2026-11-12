# Lote por script (federal, FGTS e estadual)

Passos comuns das rotinas que consultam um lote inteiro com um script no
navegador, em vez de clicar cliente a cliente. O script preenche o formulário do
próprio site, lê a resposta e devolve tudo de uma vez; o Claude só reserva,
dispara, espera e grava. Cada rotina diz qual navegador, qual página e qual
script usar.

| Tipo | Script | Navegador | Página onde rodar |
|---|---|---|---|
| federal | `receita-federal-situacao.js` | embutido do app | `https://servicos.receitafederal.gov.br/servico/certidoes/#/home/cnpj` |
| fgts | `caixa-fgts-situacao.js` | Chrome do programador | `https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf` |
| estadual | `sideb-estadual-situacao.js` | Chrome do programador | `https://www4.fazenda.sp.gov.br/SIDEB/CertidaoNegativaDebitos/EmitirECND` (logado) |
| municipal (SIA da Fiorilli) | `sia-fiorilli-situacao.js` | embutido do app | só na consulta manual: quem consulta é o robô `robo-sia.mjs` ([rotina-municipal-sia.md](rotina-municipal-sia.md)); reserve com `--municipio` |

Pasta do projeto: `C:\src\plataforma-mcont` (rode os comandos nela). Troque
`<tipo>` e `<origem>` (`manual` só na tarefa sob demanda; senão, deixe vazio).

1. Abra a página do tipo numa aba nova e confira que ela carregou (a rotina do
   tipo diz o que conferir, como a sessão do SIDEB). Só então reserve.
2. Reserve o lote, salvando a lista:
   `node integracoes/cnd/fila.mjs reservar <tipo> 25 <origem> --salvar integracoes/cnd/logs/<tipo>-reservados.json`
   Se vier `[]`, não há o que fazer: feche a aba e responda `consultados: 0`.
3. Leia o script (`C:\src\plataforma-mcont\integracoes\cnd\<script>`) e rode com
   `javascript_tool`, na aba da página, este texto: `window.__lista = ` + o JSON
   impresso no passo 2 + `;` + o conteúdo do script **sem alterar nada**. Ele
   responde `iniciado` e trabalha em segundo plano. Não navegue nessa aba enquanto
   ele trabalha.
4. Espere com `javascript_tool` (cada chamada espera até 35 s), repetindo até
   responder `pronto` ou `erro`, por no máximo 30 minutos:
   ```
   await new Promise((r) => { const t = setInterval(() => { if (window.__cnd?.out || window.__cnd?.erro) { clearInterval(t); r(); } }, 1000); setTimeout(() => { clearInterval(t); r(); }, 35000); });
   const c = window.__cnd; !c ? "sem script (a página recarregou)" : c.out ? "pronto" : c.erro ? "erro: " + c.erro : `${c.feito}/${c.total}`;
   ```
5. Pegue o resultado com `javascript_tool`: `JSON.stringify(window.__cnd.out)`.
   - Se respondeu `sem script`, `erro` ou passou dos 30 minutos: no FGTS, use
     `sessionStorage.getItem("__cnd_out")` (o parcial que o script guarda); nos
     outros, ou se vier vazio, use `{"resultados":[],"parar":"<o que aconteceu>"}`.
   Grave esse texto **sem alterar** com a ferramenta Write em
   `C:\src\plataforma-mcont\integracoes\cnd\logs\<tipo>-resultados.json`.
6. Grave na plataforma:
   `node integracoes/cnd/fila.mjs enviar integracoes/cnd/logs/<tipo>-resultados.json integracoes/cnd/logs/<tipo>-reservados.json`
   Quem o script não chegou a consultar volta para a fila sem gastar tentativa.
   O comando imprime o resumo do lote
   (`{"consultados","regular","pendente","erro","repetir","devolvidas","pendentes","parar"}`).
7. Feche a aba que abriu.

## Regras

- Não edite os scripts nem invente resultado: o que vale é o que o script leu.
- Se a página mostrar captcha antes do passo 2, não reserve nada: não tente
  resolver nem contornar, feche a aba e responda `parar = "captcha"`.
- O script para sozinho em captcha, sessão caída ou 2 erros seguidos do site;
  o motivo vem em `parar`.
