# CND municipal nas prefeituras com o SIA da Fiorilli

Verifica, no **Portal de Serviços (SIA)** de cada prefeitura, se o cliente tem
débito vencido no cadastro municipal e grava na Plataforma MCONT só a situação:
**regular** ou **pendente**.

**Quem consulta é o robô `robo-sia.mjs`, sem o Claude.** O portal é público (sem
login nem captcha), então um Chromium sem janela faz o trabalho: o robô roda no
servidor, agendado no Windows, e não gasta o plano do Claude. As tarefas
agendadas do Claude não consultam essas cidades.

> Validado em 09/11/2026, sem login nem captcha: Jaci (9 clientes em 38 s), Bady
> Bassitt (13 em 78 s), Nova Aliança, Sales, Irapuã, Meridiano, Guararapes e
> Potirendaba. A consulta é só pelo CNPJ/CPF (módulo **Contribuinte** →
> **Débitos em aberto**). O robô repetiu os mesmos resultados no Chromium sem
> janela.

## O robô

- Pasta: `integracoes/cnd`. Usa o `worker.config` (API_URL e CND_WORKER_TOKEN),
  como o `fila.mjs`.
- Para cada cidade de `sia-cidades.json` com fila municipal: reserva lotes de 25
  **só dessa cidade** (manual e agendada), abre o `home.jsf` num Chromium sem
  janela, executa `sia-fiorilli-situacao.js` e grava. Até 20 lotes por cidade e
  execução; cada lote precisa terminar em 12 minutos (a reserva expira em 15).
- Captcha, menu sem Contribuinte, portal fora do ar ou 2 erros seguidos param a
  cidade; quem não foi consultado volta à fila sem gastar tentativa.
- Log: `logs/robo-sia/AAAA-MM-DD.log` (30 dias): resumo de cada lote e nomes dos
  pendentes.

Instalação (uma vez, no servidor):

```
cd C:\src\plataforma-mcont\integracoes\cnd
npm install
npm run instalar-navegador
robo-sia.bat --simular "SP/JACI" <um CNPJ de cliente de Jaci>
```

Depois, botão direito em `instalar-robo-sia.bat` > **Executar como
administrador**. Cria a tarefa `\MCONT\Robo CND SIA`, a cada 30 minutos das 07:00
às 22:30, como SYSTEM (funciona sem ninguém logado). Com a fila vazia o robô só
pergunta à plataforma e sai.

Comandos:

- `robo-sia.bat`: todas as cidades com fila
- `robo-sia.bat --cidade "SP/JACI"`: só uma cidade
- `robo-sia.bat --simular "SP/JACI" <CPF/CNPJ> [...]`: consulta e mostra, sem
  reservar nem gravar (para testar uma cidade nova)

## Cidades

Ficam em `sia-cidades.json` (o robô) e, uma linha por cidade, em `cnd_cobertura`
(`municipio` como no cadastro do cliente; sem a cobertura, os clientes da cidade
não entram na fila).

| Município | Página |
|---|---|
| `SP/JACI` | `http://200.95.195.126:5661/servicosweb/home.jsf` |
| `SP/BADY BASSITT` | `http://200.95.223.250:5661/servicosweb/home.jsf` |
| `SP/NOVA ALIANCA` | `http://200.95.195.94:8081/servicosweb/home.jsf` |
| `SP/SALES` | `https://servicos.sales.sp.gov.br/servicosweb/home.jsf` |
| `SP/IRAPUA` | `http://170.0.49.34:8080/servicosweb/home.jsf` |
| `SP/MERIDIANO` | `https://sia.meridiano.sp.gov.br/servicosweb/home.jsf` |
| `SP/GUARARAPES` | `http://138.97.36.146:5657/servicosweb/home.jsf` |
| `SP/POTIRENDABA` | `https://servicosonline.potirendaba.sp.gov.br:5661/servicosweb/home.jsf` |

Ficaram de fora: **Tanabi**, **Cedral** e **Poloni** (o portal não tem o módulo
Contribuinte, só o Mobiliário, que pede a inscrição municipal) e **Ícem** (o
portal não respondeu em 09/11/2026).

Para incluir outra cidade com o SIA: abra o `home.jsf` dela, confira que o menu
tem **Contribuinte**, teste com `robo-sia.bat --simular`, acrescente a cidade em
`sia-cidades.json`, nesta tabela e em `cnd_cobertura`.

## O que o script lê

O script abre a consulta num quadro dentro da própria página, recarrega o início
antes de cada cliente (para a sessão trocar de contribuinte), confere que a
página mostra o CNPJ/CPF pedido e lê a lista de débitos:

| O site mostrou | Resultado |
|---|---|
| "O contribuinte não possui débitos pendentes" | regular |
| Só parcelas a vencer ou suspensas (bolinha cinza) | regular "Sem débito vencido (…)" |
| Parcela vencida: dívida ativa, do exercício, protestada ou ajuizada | pendente com as parcelas por tributo e ano |
| "Cadastro: NÃO CONSTA" | erro "Não consta nos cadastros da prefeitura": a equipe confere (pode estar cadastrado pelo CPF do sócio ou por outro CNPJ) |
| Lista com mais páginas e nenhuma vencida na primeira | volta à fila (não dá para afirmar regular) |
| Página de outro contribuinte, sem resposta, erro do site | volta à fila; 2 seguidos param o lote |
| Captcha, ou o menu sem Contribuinte | para o lote (`parar`) |

Filial é consultada pelo próprio CNPJ (o cadastro municipal é por
estabelecimento). Clientes repetidos no lote são consultados uma vez só.

Alguns portais em https (Sales) mandam para um endereço http depois do OK; o
navegador bloqueia e o script abre a mesma página pelo endereço https. Isso é
esperado, não é erro.

## Consulta manual (sem o robô)

Se o robô estiver fora (servidor, Node), uma tarefa do Claude pode fazer um lote
pelo navegador do app, seguindo [rotina-lote-script.md](rotina-lote-script.md)
com o tipo `municipal`, o script `sia-fiorilli-situacao.js` e a página da cidade,
reservando assim:

```
node integracoes/cnd/fila.mjs reservar municipal 25 <origem> --municipio "SP/JACI" --salvar integracoes/cnd/logs/municipal-reservados.json
```

e usando `municipal-resultados.json` no `enviar`. Só leia (não gere boleto, não
emita certidão, não altere cadastro), não resolva nem contorne captcha e não
invente resultado.
