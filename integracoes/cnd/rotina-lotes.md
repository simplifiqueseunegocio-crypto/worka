# Rotinas de CND em lotes (economia de uso do Claude)

Como as tarefas agendadas do Claude rodam as rotinas de CND gastando o mínimo do
limite do plano.

> Medido em 23/10/2026: a federal rodou 163 clientes numa conversa só, no Opus, e
> leu ~298 milhões de tokens (≈1,8 milhão por cliente), porque cada passo relê a
> conversa inteira, que só cresce. Em 03/11/2026, com subagentes Haiku/Sonnet em
> lotes de 10 clicando cliente a cliente: federal e FGTS ≈1% da sessão de 5 h a
> cada 20 clientes, estadual (Sonnet) ≈3%. Daí os scripts de lote
> ([rotina-lote-script.md](rotina-lote-script.md)): o Claude não clica por
> cliente, só dispara o script e grava.

## Como funciona

A tarefa agendada é só a **coordenadora**. Ela não abre o site nem consulta
cliente nenhum:

1. Conta a fila sem reservar (`node integracoes/cnd/fila.mjs pendentes <tipo> [manual]`).
   `0`: encerra.
2. Para cada lote, chama a ferramenta **Agent** (`subagent_type: "general-purpose"`)
   com o **modelo do tipo** (tabela abaixo) e o pedido do modelo de pedido abaixo,
   e espera o resultado antes do próximo. Um lote por vez do mesmo navegador
   (o Chrome e os sites são um só).
3. Para quando: o subagente responder `consultados: 0` (fila vazia), responder
   `parar` preenchido (captcha, sessão, site fora do ar), ou chegar ao **teto de
   lotes por execução**. O que sobrar fica para a próxima execução agendada.
4. Soma os resumos e responde.

| Tipo | Roteiro | Modelo do subagente | Lote | Teto por execução |
|---|---|---|---|---|
| federal | rotina-federal.md | `haiku` | 25 (script) | 8 lotes (200 clientes) |
| fgts | rotina-fgts.md | `haiku` | 25 (script) | 8 lotes (200 clientes) |
| estadual | rotina-estadual.md | `haiku` | 25 (script) | 8 lotes (200 clientes) |
| municipal Rio Preto | rotina-municipal.md | `haiku` | fila inteira da cidade | 1 subagente (o script lê tudo de uma vez) |

**Municipal é por cidade.** As tarefas do Claude só consultam Rio Preto: contam
com `node integracoes/cnd/fila.mjs pendentes municipal [manual] --municipio "SP/SAO JOSE DO RIO PRETO"`
(sem o `--municipio`, a contagem inclui clientes de outras cidades). As
prefeituras com o SIA da Fiorilli são consultadas pelo robô `robo-sia.mjs`, sem
o Claude ([rotina-municipal-sia.md](rotina-municipal-sia.md)). O `fila.mjs`
recusa reservar a municipal sem `--municipio`, e o `gravar municipal` sem a
opção fica em Rio Preto.

## Horários (fora do expediente)

As rodadas mensais rodam à noite e de madrugada, para não gastar a sessão de
5 horas usada no expediente. A fila do mês entra no dia 23 às 06:00.

| Tarefa | Quando | Observação |
|---|---|---|
| `cnd-estadual-mensal` | dias 23 a 27, 06:15, 19:15 e 20:15 | SIDEB só em dias úteis, 06:00–21:00 |
| `cnd-municipal-mensal` | dias 23 a 26, 21:30 | |
| `cnd-federal-mensal` | dias 23 a 27, 22:00, 01:00 e 03:00 | navegador do app |
| `cnd-fgts-mensal` | dias 23 a 27, 23:00, 02:00 e 04:00 | Chrome do programador |
| `cnd-sob-demanda` | dias úteis 09:00, 13:00 e 16:00 | pedidos da equipe pelos botões; fica de dia |

FGTS e estadual usam o mesmo Chrome, mas não se cruzam: a estadual termina até
21:00 e o FGTS começa às 23:00. Nas madrugadas do dia 23 (antes de a fila
entrar), federal e FGTS só encontram o que sobrou do mês anterior.

## Modelo de pedido para o subagente

Troque `<tipo>`, `<roteiro>` e `<origem>` (`manual` só na tarefa sob demanda;
senão, deixe vazio):

```
Você consulta UM lote de certidões <tipo> da Plataforma MCONT. Responda em
português do Brasil. Ninguém está acompanhando: não peça confirmação.

1. Leia C:\src\plataforma-mcont\integracoes\cnd\<roteiro> e
   rotina-lote-script.md na mesma pasta, e siga-os à risca. Se o roteiro usa o
   Claude in Chrome, leia também rotina-chrome-govbr.md e escolha o Chrome do
   programador antes de tudo (list_connected_browsers + select_browser com o
   deviceId dele); se ele não estiver conectado, não reserve nada e responda
   parar = "Chrome do programador não conectado". Carregue as ferramentas do
   navegador numa única chamada ToolSearch.
2. Faça UM lote (reservar <tipo> 25 <origem> --salvar ..., script, enviar). Não
   reserve outro lote. Se a reserva vier [], responda consultados = 0.
3. Feche as abas que abrir.
4. Sua resposta final é SÓ a linha JSON impressa pelo `enviar`:
   {"consultados":0,"regular":0,"pendente":0,"erro":0,"repetir":0,"devolvidas":0,"pendentes":["nome"],"parar":""}
   parar = motivo para a coordenadora não mandar outro lote (captcha, sessão do
   gov.br, site fora do ar); vazio se correu bem.
```

Para a **municipal de Rio Preto**, o pedido é o mesmo, mas o passo 2 é: "Siga o
roteiro inteiro: leitura em lote no ISS Digital e
`node integracoes/cnd/fila.mjs gravar municipal integracoes/cnd/logs/municipal-situacao.json <origem> --municipio "SP/SAO JOSE DO RIO PRETO"`".
`consultados` = soma do resumo do `gravar`.
