# Rotina: regularidade do FGTS (CRF da Caixa)

Roteiro das tarefas agendadas do Claude. Consulta, no site público da Caixa, se
cada cliente da fila está regular no FGTS e grava na Plataforma MCONT só a
situação: **regular** ou **pendente**.

> Validado em 20/10/2026 no Claude in Chrome deste servidor. O site da Caixa tem
> um bloqueador anti-robô (ShieldSquare) que barra o navegador embutido do app;
> por isso esta rotina usa o Chrome. Desde 03/11/2026 o lote é consultado de uma
> vez pelo script `caixa-fgts-situacao.js` (no teste, 3 clientes em 13 s).

## Antes de começar

- Pasta do projeto: `C:\src\plataforma-mcont`. Comandos da fila (rodar nessa pasta):
  - `node integracoes/cnd/fila.mjs pendentes fgts [manual]` (só conta, sem
    reservar; `0` = nada a fazer)
  - `reservar` e `enviar`: como em [rotina-lote-script.md](rotina-lote-script.md).
- Navegador: **Claude in Chrome** no Chrome do usuário **programador**: siga os
  passos 1 e 2 de [rotina-chrome-govbr.md](rotina-chrome-govbr.md) (escolher o
  Chrome certo, aba nova). Se ele não estiver conectado, não use outro navegador:
  relate e encerre sem reservar.

## Consulta do lote

Siga [rotina-lote-script.md](rotina-lote-script.md) com o tipo `fgts`, o script
`caixa-fgts-situacao.js` e a página
`https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf`
(confira que ela mostra o formulário "Critérios de Pesquisa" antes de reservar).

O script usa o próprio formulário da página e classifica:

| O site mostrou | Resultado |
|---|---|
| "A empresa abaixo identificada esta REGULAR no FGTS" | regular |
| "…não são suficientes para a comprovação…", impedimentos, irregular, débito | pendente com o texto do aviso |
| Inscrição inválida ou não encontrada | erro com o texto do aviso |
| "Não foi possível verificar a regularidade junto à CAIXA…" | erro "Caixa não verificou a regularidade e orienta procurar uma agência": para alguns CNPJs a Caixa responde isso sempre. Com 3 seguidos, o script reconsulta um cliente que já deu regular no lote; se ele também falhar, a Caixa caiu: o lote para e os seguidos voltam sem gastar tentativa |
| Sem resposta, erro do site | volta à fila; 2 seguidos param o lote |
| Captcha ou página "ShieldSquare" | para o lote (`parar`) |

Não é preciso abrir nem baixar o certificado (CRF).

## Captcha e bloqueios

Se aparecer captcha ou página de verificação ("ShieldSquare Captcha"), **não
tente resolver nem contornar**. Antes de reservar: feche a aba e encerre. Durante
o lote: o script para; siga o passo 5 de rotina-lote-script.md (parcial do
`sessionStorage`) e o `enviar` devolve à fila quem não foi consultado.

## Ao terminar

Resposta final curta, em português: o resumo do `enviar` e se parou antes do
fim. Não envie e-mail nem mensagem: os resultados já estão na plataforma.
