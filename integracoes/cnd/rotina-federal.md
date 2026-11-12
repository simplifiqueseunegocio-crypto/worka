# Rotina: CND federal (Receita Federal / PGFN)

Roteiro das tarefas agendadas do Claude. Consulta, no site público da Receita,
se cada cliente da fila consegue emitir a certidão federal e grava na
Plataforma MCONT só a situação: **regular** ou **pendente**.

Não é preciso informar qual é a pendência, nem baixar ou guardar a certidão.

> Desde 03/11/2026 o lote é consultado de uma vez pelo script
> `receita-federal-situacao.js` ([rotina-lote-script.md](rotina-lote-script.md)):
> no teste, 3 clientes em 24 s, sem captcha.

## Antes de começar

- Pasta do projeto: `C:\src\plataforma-mcont`. Comandos da fila (rodar nessa pasta):
  - `node integracoes/cnd/fila.mjs pendentes federal [manual]`: só conta, sem
    reservar. `0` = nada a fazer.
  - `reservar` e `enviar`: como em [rotina-lote-script.md](rotina-lote-script.md).
- Navegador: o navegador embutido do app (ferramentas `mcp__Claude_Browser__*`).
  Não aceite os cookies.

## Consulta do lote

Siga [rotina-lote-script.md](rotina-lote-script.md) com o tipo `federal`, o
script `receita-federal-situacao.js` e a página
`https://servicos.receitafederal.gov.br/servico/certidoes/#/home/cnpj` (confira
que ela mostra o campo "Informe o CNPJ" antes de reservar).

O script preenche o CNPJ/CPF, clica em **Emitir Certidão** e classifica:

| O site mostrou | Resultado |
|---|---|
| "…são insuficientes para emitir a certidão pela Internet" | pendente "Receita não emitiu a certidão (informações insuficientes)" |
| Certidão emitida, **Negativa** ou **Positiva com efeitos de negativa** | regular |
| Janela "Certidão Válida Encontrada" | regular "Já existe certidão válida na Receita" |
| Filial ("A certidão deve ser emitida para o CNPJ da matriz") | o script já consulta pelo CNPJ da matriz, que vale para todas as filiais; a mensagem cita a matriz |
| "CNPJ inválido", inexistente, baixado, inapto | erro com o texto do aviso |
| Sem resposta em 30 s | volta à fila (repetir) |
| Desafio de captcha visível | para o lote (`parar`) |
| HTTP 431 (Request Header Fields Too Large) | para o lote (`parar`); ver abaixo |

Se o site abrir um PDF ou pedir para salvar um arquivo, não salve.

## Captcha e bloqueios

O site usa um hCaptcha invisível, que normalmente passa sem aparecer. **Se
aparecer um desafio de captcha visível, não tente resolver nem contornar**: o
script para sozinho e o `enviar` devolve à fila quem não foi consultado.

**HTTP 431:** os cookies HttpOnly que a Receita grava no navegador, somados ao
token do hCaptcha, passam do limite de cabeçalho do site (aconteceu no navegador
do app em 04/11/2026, depois de ~150 consultas). A página não enxerga nem apaga
esses cookies. Se o lote parar por isso, rode a federal no **Chrome do
programador** (ferramentas `mcp__claude-in-chrome__*`, mesmo script), sem limpar
cookies nem mexer nas configurações do navegador, e avise na resposta final.

## Ao terminar

Resposta final curta, em português: o resumo do `enviar` (quantos consultados,
regulares, pendentes com os nomes, erros, devolvidos) e se parou antes do fim
(e por quê). Não envie e-mail nem mensagem: os resultados já estão na plataforma.
