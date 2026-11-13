# Plataforma Worka

Gestão interna do escritório: clientes, obrigações mensais e prazos.
Veja o escopo em [ESCOPO.md](ESCOPO.md).

**Stack:** Next.js 16 + TypeScript + Tailwind · Supabase · Vercel

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha com os dados do Supabase
npm run dev
```

Acesse http://localhost:3000.

> **Página recarregando sem parar?** O cache de desenvolvimento em `.next` corrompeu (costuma acontecer
> ao rodar `npm run build` ou um segundo `npm run dev` com outro servidor aberto). Pare o servidor,
> apague a pasta `.next` e rode `npm run dev` de novo.
>
> Para conferir o build de produção com o `npm run dev` aberto, gere-o em outra pasta:
> `$env:NEXT_DIST_DIR='.next-build'; npm run build` (PowerShell).

## Banco de dados

As migrations ficam em `supabase/migrations` e devem ser aplicadas em ordem
(SQL Editor do Supabase ou `supabase db push`).

- `…_fase1.sql`: tabelas, regras de acesso (RLS), cálculo de prazos e dados iniciais
- `…_cron_tarefas.sql`: gera as tarefas todo dia 1º (competência do mês anterior)
- `…_cnd.sql` / `…_cron_cnd.sql`: fila de consultas de CND e rodada mensal (dia 23)

Para testar a migration localmente, sem precisar do Supabase:

```bash
npm run test:db
```

## Estrutura

- `src/app` — rotas (App Router)
- `src/lib/supabase` — clientes do Supabase para navegador (`client.ts`) e servidor (`server.ts`)
- `src/proxy.ts` — renova a sessão do Supabase a cada requisição
- `supabase/migrations` — migrations do banco (Supabase CLI)
- `supabase/tests` — testes das regras do banco (PGlite)

## Folha de adiantamento

Em **Adiantamento**, o Departamento Pessoal (ou o admin) solta os PDFs gerados no Domínio Folha e a
plataforma manda cada um por e-mail (Resend) ao cliente. Cada envio fica registrado por competência.

- Aplique a migration `…_adiantamento.sql`.
- O cliente é reconhecido pelo nome do arquivo: código da empresa no Domínio ou CNPJ/CPF
  (ex.: `254 - Empresa.pdf`). Sem reconhecer, escolhe-se na própria linha.
- Destinatários: os contatos do cliente marcados com "Recebe a folha" (página do cliente → Contatos);
  sem nenhum marcado, o e-mail do cadastro vindo do Domínio.
- Até 4 MB por PDF (limite de corpo da Vercel é 4,5 MB). O PDF não fica guardado na plataforma.

## Tarefas pessoais

Em **Minhas tarefas**, cada pessoa cria lembretes próprios (título, prazo, detalhes e cliente opcional),
fora do catálogo de obrigações. Só o dono vê, nem o admin. Migration `…_tarefas_pessoais.sql`.

- Repetição **mensal** ou **anual**: ao concluir, a próxima nasce no mesmo dia do mês (ou ano) seguinte;
  em meses mais curtos vale o último dia (31/01 → 28/02 → 31/03).
- Para parar de repetir, edite a tarefa e escolha "Não repete".

## Usuários

Não há cadastro aberto. O admin cria as contas em **Configurações → Equipe** (nome, e-mail, papel e
departamentos) e a pessoa recebe pelo Resend um e-mail com o link para `/definir-senha`. Na mesma tela dá
para reenviar o e-mail (convite expirado ou senha esquecida) e desativar ou reativar o acesso.

- Aplique a migration `…_usuario_novo_inativo.sql`: conta criada fora da tela Equipe nasce **desativada**.
- No Supabase, desligue o cadastro público: *Authentication → Sign In / Providers → Allow new users to sign up*.
  A criação pela tela continua funcionando (usa a chave secreta).
- O link vale pelo tempo de *Email OTP Expiration* (padrão 1 hora; até 24 horas) em
  *Authentication → Sign In / Providers → Email*.
- Cadastre `APP_URL` com o endereço público da plataforma, para os links dos e-mails.

## Integração com a Conta Azul (uma conexão por cliente)

Cada empresa cliente tem a sua **Conta Azul Pro**. O escritório conecta cada uma na plataforma e,
todo dia às 23:00 (Vercel Cron, `/api/automacoes/conta-azul`), lê da Conta Azul de cada cliente o
**cadastro da empresa** e os **clientes e fornecedores** dela
(migrations `…_integracao_conta_azul.sql` e `…_conta_azul_por_cliente.sql`). Substitui a antiga
integração com o Domínio.

### Por que um usuário por empresa

A API da Conta Azul autoriza **uma empresa por vez**, com o login de um usuário **da Conta Azul Pro**
daquela empresa. O acesso de contador da Conta Azul Mais não serve para autorizar a API, e a Conta Azul
não aceita o mesmo e-mail como usuário em duas contas Pro. Por isso:

1. Em cada Conta Azul Pro (pela Conta Azul Mais), crie um usuário para o escritório em
   **Configurações → Usuários**, com um e-mail próprio daquela empresa. No Gmail, use apelidos:
   `integracao+cliente@gmail.com` chega na caixa de `integracao@gmail.com`.
2. Abra o convite e crie a senha.
3. Em **Configurações → Conta Azul**, clique em **Adicionar empresa** (de preferência numa janela
   anônima a cada empresa) e entre com esse usuário.

### Configuração do servidor

- No [Portal do Desenvolvedor da Conta Azul](https://developers.contaazul.com), cadastre no app a URL
  de redirecionamento `<APP_URL>/api/integracoes/conta-azul/retorno` (a tela mostra o endereço exato).
- `CONTA_AZUL_CLIENT_ID`, `CONTA_AZUL_CLIENT_SECRET` e `CRON_SECRET` no `.env` e na Vercel.
- A conexão é feita **pelo site publicado** (o login da Conta Azul volta para a URL cadastrada).

### Regras

- Conectar uma empresa **cria o cliente** na plataforma, ou vincula ao cliente que já existe com o mesmo
  CNPJ/CPF. Cliente novo entra **ativo** e **sem regime**: defina o regime para ele receber obrigações.
- **Reconectar** confere o CNPJ: se o login for de outra empresa, a conexão é recusada.
- A sincronização atualiza razão social, fantasia, e-mail e telefone (campo vazio na Conta Azul não apaga o
  que já existe) e regrava os clientes e fornecedores (`conta_azul_pessoas`). Não suspende nem apaga clientes.
- **Desconectar** só para a atualização; o cliente e os dados já lidos continuam.
- Tokens em `conta_azul_conexoes` (só o servidor acessa). O access token dura 1 hora e é renovado sozinho;
  o refresh token muda a cada renovação. Se a autorização expirar, o erro aparece na linha do cliente e no log.
- A rotina processa do cliente mais desatualizado para o mais novo até o limite de tempo; o que sobrar fica
  para a rodada seguinte. Resumo de cada rodada em **Configurações → Log de sincronização**.

## Certidões (CND)

O módulo **Certidões** mostra, para cada cliente com a busca ligada, se há pendência nas certidões
**federal** (RFB/PGFN e INSS), **FGTS**, **estadual** e **municipal**. A plataforma só aponta a situação;
a emissão da certidão continua com a equipe.

- A busca é ligada na página de cada cliente (admin e gestor). No primeiro uso, a tela Certidões
  oferece ligar para toda a carteira ativa.
- Todo dia 23, às 06:00, o banco coloca na fila as certidões automáticas (`cnd_tipos`) de cada cliente
  monitorado (`…_cron_cnd.sql`). Também dá para consultar na hora: clientes selecionados (qualquer usuário)
  ou a carteira (admin e gestor).
- A fila é consumida por **tarefas agendadas do Claude** no app desktop do servidor do escritório (IP no
  Brasil, como os sites de governo exigem), por `POST /api/integracoes/cnd/pendentes`, `/reservar` e
  `/resultados` (`Authorization: Bearer $CND_WORKER_TOKEN`).
- Erro temporário (site fora do ar) volta para a fila 1 hora depois, até 3 tentativas. Consulta presa
  por mais de 15 minutos volta a ser reservada. Quem um lote reservou e não chegou a consultar volta
  sem gastar tentativa (`devolver`).

### Como as tarefas consultam

A tarefa agendada é só a coordenadora: conta a fila (`fila.mjs pendentes`) e manda um subagente Haiku
por lote de 25 clientes, até 8 lotes por execução. O subagente reserva o lote, roda um script na própria
página do site, que consulta o lote inteiro de uma vez, e grava com `fila.mjs enviar`. Um lote custa
cerca de 1% da sessão de 5 horas. Detalhes em [`rotina-lotes.md`](integracoes/cnd/rotina-lotes.md) e
[`rotina-lote-script.md`](integracoes/cnd/rotina-lote-script.md).

| Certidão | Tarefa e horários (fora do expediente) | Navegador | Roteiro e script |
|---|---|---|---|
| Federal | `cnd-federal-mensal`, dias 23 a 27, 22:00, 01:00 e 03:00 | navegador do app | [`rotina-federal.md`](integracoes/cnd/rotina-federal.md), `receita-federal-situacao.js` |
| FGTS | `cnd-fgts-mensal`, dias 23 a 27, 23:00, 02:00 e 04:00 | Chrome do programador | [`rotina-fgts.md`](integracoes/cnd/rotina-fgts.md), `caixa-fgts-situacao.js` |
| Estadual SP (SIDEB) | `cnd-estadual-mensal`, dias 23 a 27, 06:15, 19:15 e 20:15 (só dias úteis, 06–21h) | Chrome do programador, logado no gov.br | [`rotina-estadual.md`](integracoes/cnd/rotina-estadual.md), `sideb-estadual-situacao.js` |
| Municipal Rio Preto | `cnd-municipal-mensal`, dias 23 a 26, 21:30 | Chrome do programador, logado no gov.br | [`rotina-municipal.md`](integracoes/cnd/rotina-municipal.md), `iss-riopreto-situacao.js` |

As prefeituras com o **SIA da Fiorilli** (portal público, sem login nem captcha) não usam o Claude: o
robô `integracoes/cnd/robo-sia.mjs` (Node + Playwright, Chromium sem janela) roda no servidor pela tarefa
do Windows `\MCONT\Robo CND SIA`, a cada 30 minutos das 07:00 às 22:30, e pega a rodada do dia 23 e os
pedidos da tela. Instalação e cidades em [`rotina-municipal-sia.md`](integracoes/cnd/rotina-municipal-sia.md).
Nos outros sites o Claude continua necessário: o gov.br e a Receita recusam navegador automatizado
(hCaptcha), e a consulta roda no Chrome do programador.

A municipal é consultada **por cidade**: `reservar`, `pendentes` e `gravar` aceitam
`--municipio "UF/NOME"` (obrigatório para reservar a municipal), e a API filtra a fila por
`uf` e `municipio`, para a rotina de uma prefeitura nunca pegar cliente de outra.

Os pedidos feitos pela tela (origem `manual`) vão para a tarefa `cnd-sob-demanda`, em dias úteis às
9h, 13h e 16h, com até 2 lotes de 25 por tipo.

A trabalhista (CNDT) fica fora da rodada (`cnd_tipos.automatico = false`): o site do TST exige captcha
de imagem em toda consulta.

### Cobertura por estado e município

Federal e FGTS valem para todo cliente. A estadual e a municipal só entram na fila para clientes de uma
UF ou município listado em `cnd_cobertura`, pelo `uf` e pelo nome do município (`clientes.municipio`) que
vêm da Conta Azul (o nome é comparado sem acento e sem diferença de maiúsculas). Os demais aparecem na tela com um traço ("Sem cobertura") e não
contam como erro. Hoje: estadual em **SP** (SIDEB) e municipal em **São José do Rio Preto** e, com
o SIA da Fiorilli, em Jaci, Bady Bassitt, Nova Aliança, Sales, Irapuã, Meridiano, Guararapes e
Potirendaba, depois de aplicar `supabase/cobertura-sia.sql`.

Ao criar a rotina de um novo estado ou município, inclua a linha (como admin, no SQL Editor), com o nome
como aparece no cadastro do cliente; maiúsculas e acentos não importam:

```sql
insert into cnd_cobertura (tipo, uf, observacao) values ('estadual', 'MG', 'rotina-estadual-mg.md');
insert into cnd_cobertura (tipo, uf, municipio, observacao) values ('municipal', 'SP', 'MIRASSOL', 'rotina-municipal-mirassol.md');
```

Em Rio Preto, a municipal cobre
só as empresas que aparecem em "Meus Cadastros" no ISS Digital para o CPF do login; as demais ficam como
erro "Fora do ISS Digital".

### Configuração no servidor

1. Gere um token e cadastre como `CND_WORKER_TOKEN` na Vercel.
2. Em `integracoes/cnd`, copie `worker.config.example` para `worker.config` e preencha `API_URL` e
   `CND_WORKER_TOKEN` (o `fila.mjs` lê os dois; Node.js 20.11 ou mais novo, sem dependências).
3. A sessão do Windows do programador precisa continuar logada, com o Chrome e o app do Claude abertos.
   As tarefas escolhem o Chrome do programador pelo deviceId e, se a sessão do gov.br caiu, clicam em
   "Seu certificado digital" ([`rotina-chrome-govbr.md`](integracoes/cnd/rotina-chrome-govbr.md)).
   Captcha: a tarefa não resolve, para e o resto fica para a próxima execução.

Para ligar um tipo na rodada (como admin, no SQL Editor): `update cnd_tipos set automatico = true where tipo = '…';`

### Certidões emitidas e tipos por cliente

Migration `…_certidoes.sql` (cria também o bucket privado `certidoes` no Storage).

- **Catálogo** (Configurações → Certidões, admin): os 5 tipos com consulta automática e os que a equipe
  cadastrar (ex.: falência), com validade padrão em dias e se valem para todo cliente. Tipos automáticos
  não são excluídos, só desativados; tipo com certidão lançada também só se desativa.
- **Por cliente** (página do cliente → Certidões emitidas, admin e gestor): acompanhar ou não cada tipo.
  Um tipo automático desligado sai da fila e aparece como "Não acompanha" na tela Certidões, fora das
  contagens (como "Sem cobertura").
- **Lançar certidão** (qualquer pessoa da equipe): tipo, situação (negativa, positiva com efeito de
  negativa ou positiva), emissão, validade (sugerida pelo tipo) e o PDF, até 4 MB. Exclui quem lançou,
  o gestor ou o admin; o PDF sai do Storage junto.
