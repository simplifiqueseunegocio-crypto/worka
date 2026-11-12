# Rotina: CND estadual de SP (SIDEB – Sefaz/PGE)

Roteiro das tarefas agendadas do Claude. Pede, no SIDEB, a Certidão Única de
Débitos Sefaz/PGE (tributos não inscritos e Dívida Ativa) de cada cliente da fila
e grava na Plataforma MCONT só a situação: **regular** ou **pendente**.

> Validado em 20/10/2026 no Claude in Chrome deste servidor, com a sessão do
> gov.br aberta: a emissão não pede captcha. Em 03/11/2026 o SIDEB abriu logado
> depois do login com o e-CPF no Chrome do programador, e o lote passou a ser
> consultado de uma vez pelo script `sideb-estadual-situacao.js` (no teste, 3
> clientes em 8 s). O SIDEB só funciona em **dias úteis, das 06:00 às 21:00**.

## Antes de começar

- Pasta do projeto: `C:\src\plataforma-mcont`. Comandos da fila (rodar nessa
  pasta): `reservar` e `enviar`, como em [rotina-lote-script.md](rotina-lote-script.md).
- Navegador: **Claude in Chrome** no Chrome do usuário **programador**. Antes de
  tudo, siga [rotina-chrome-govbr.md](rotina-chrome-govbr.md): escolher o Chrome
  certo e, se a sessão tiver caído, o login com certificado.

## Sessão do gov.br

1. Abra `https://www4.fazenda.sp.gov.br/SIDEB/CertidaoNegativaDebitos/EmitirECND`.
2. Se a página mostrar o seletor "Selecione o documento" e o menu com "Sair", a
   sessão está aberta: siga.
3. Se cair na página inicial, clique em **"Emitir eCND"** uma vez. O site passa
   pelo login da Fazenda e volta logado ou cai na tela do gov.br.
4. Na tela do gov.br, faça o login com certificado
   ([rotina-chrome-govbr.md](rotina-chrome-govbr.md)) e volte ao endereço do passo 1.
   Se a Fazenda (idp.sp.gov.br) mostrar a própria tela de login, escolha a opção
   gov.br; nunca digite CPF ou senha.
5. Se o site disser que está fora do horário ou indisponível, encerre sem reservar.

## Consulta do lote

Com a página do passo 1 aberta e logada, siga
[rotina-lote-script.md](rotina-lote-script.md) com o tipo `estadual` e o script
`sideb-estadual-situacao.js`.

O script envia o formulário da própria página pelo **CNPJ base** (8 primeiros
dígitos, vale para matriz e filiais; clientes com a mesma base recebem o mesmo
resultado) ou pelo CPF, e classifica pelo endereço da resposta:

| O site respondeu | Resultado |
|---|---|
| `resultado=Negativa` (eCND emitida) | regular "eCND" |
| Positiva com efeito de negativa (eCPEN) | regular "eCPEN (positiva com efeito de negativa)" |
| `resultado=Positiva` / "Não foi possível emitir a Certidão Negativa de Débitos" | pendente "SIDEB não emitiu a certidão" |
| "Página não encontrada" | tenta uma vez mais; depois volta à fila |
| Documento inválido ou não encontrado | erro com o texto do aviso |
| Sessão caída ou fora do horário | para o lote (`parar`) |

O script não abre nem baixa a certidão.

## Regras

- Se aparecer captcha em qualquer tela, não tente resolver nem contornar: pare
  e relate.
- Nunca clique em "Logout"/"Sair": a sessão é usada pelas próximas execuções.
- O único login permitido é o clique em "Seu certificado digital" no gov.br.

## Ao terminar

Resposta final curta, em português: o resumo do `enviar` e se parou antes do fim
(sessão expirada, fora do horário, captcha).
