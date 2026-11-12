# Plataforma MCONT — Escopo

Sistema de **gestão interna** do escritório: carteira de clientes, obrigações
mensais e controle de prazos por departamento e responsável.

**Stack:** Next.js 16 (App Router, TypeScript, Tailwind) na Vercel e Supabase
(Postgres, Auth, Storage e cron). Não há backend separado: a regra de negócio
fica em Server Actions e no banco, e o acesso é controlado por RLS.

---

## 1. Problema que resolve

Hoje o controle de "o que precisa ser entregue, para qual cliente, até quando
e por quem" costuma ficar espalhado em planilhas e na cabeça das pessoas. A
plataforma deve responder, a qualquer momento:

- O que está **atrasado** ou **vence esta semana**?
- Como está a **competência** (mês) de cada departamento, em % concluído?
- Quem é o **responsável** por cada cliente em cada departamento?
- O que está **parado esperando o cliente** (documentos, extratos, notas)?

## 2. Usuários e papéis

| Papel | Pode |
|---|---|
| **Admin** | Tudo: usuários, departamentos, catálogo de obrigações, configurações |
| **Gestor** | Gerencia clientes e tarefas do(s) seu(s) departamento(s) e redistribui responsáveis |
| **Colaborador** | Vê e atualiza as tarefas sob sua responsabilidade e consulta a carteira |

Departamentos iniciais (ajustáveis): **Fiscal, Contábil, Pessoal (DP),
Societário/Legalização e Financeiro**.

## 3. Fases

### Fase 1 — MVP (o mínimo para substituir a planilha)

1. **Autenticação e equipe**
   - Login por e-mail e senha (Supabase Auth), sem cadastro público: só o admin convida.
   - Cadastro de usuários com papel e departamento(s).
2. **Carteira de clientes**
   - CNPJ/CPF, razão social, nome fantasia, regime tributário (MEI, Simples,
     Presumido, Real), status (ativo, suspenso, encerrado), data de início e contatos.
   - Preenchimento automático pelo CNPJ (BrasilAPI / ReceitaWS).
   - Responsável por departamento em cada cliente.
   - Busca, filtros (regime, responsável, status) e importação via planilha (CSV).
3. **Catálogo de obrigações**
   - Modelos como DAS, DCTFWeb, EFD-Reinf, EFD ICMS/IPI, EFD-Contribuições,
     eSocial/folha, FGTS Digital, DEFIS, ECD, ECF e balancete mensal.
   - Para cada modelo: departamento, periodicidade (mensal, trimestral ou anual),
     dia de vencimento, regra para fim de semana ou feriado (antecipa ou posterga),
     **meta interna** (ex.: 3 dias antes do prazo legal) e a quais regimes se aplica.
   - Vínculo cliente × obrigação, gerado pelo regime e ajustável cliente a cliente.
4. **Tarefas por competência**
   - Geração automática todo mês (pg_cron no Supabase), cruzando clientes ativos
     com as obrigações vinculadas, e geração manual para uma competência.
   - Status: *pendente → em andamento → aguardando cliente → concluída*
     (ou *dispensada*, com justificativa).
   - Registro de quem concluiu e quando.
5. **Painel**
   - Atrasadas, vencendo em 7 dias e aguardando cliente.
   - Percentual concluído da competência por departamento e por responsável.
   - Visão "minhas tarefas" para o colaborador.

### Fase 2 — Operação completa

- **Anexos** em cada tarefa (guias e recibos de entrega) no Supabase Storage.
- **Comentários e histórico** (log de auditoria das mudanças de status).
- **Calendário de feriados** nacionais, estaduais e municipais para calcular os prazos.
- **Notificações por e-mail** (resumo diário de vencimentos e alertas de atraso).
- **Processos e checklists**: onboarding de cliente, abertura, alteração e baixa
  de empresa, admissão e rescisão (tarefas avulsas com etapas).
- **Relatórios**: produtividade por colaborador, histórico de atrasos por cliente
  e exportação para Excel.

### Fase 3 — Expansão (avaliar depois)

- Portal do cliente (envio de documentos e download de guias).
- Integração com o sistema contábil usado hoje (Domínio, Alterdata etc.), por importação.
- Controle de honorários e contratos.
- Notificações por WhatsApp.

### Fora do escopo

Emissão de guias, transmissão de obrigações e escrituração contábil e fiscal.
A plataforma **controla** o trabalho; o sistema contábil continua **executando**.

## 4. Modelo de dados (rascunho)

```
profiles            (id → auth.users, nome, papel, ativo)
departamentos       (id, nome)
profile_departamentos (profile_id, departamento_id)

clientes            (id, documento, razao_social, fantasia, regime, status, inicio_em, ...)
cliente_contatos    (id, cliente_id, nome, email, telefone)
cliente_responsaveis(cliente_id, departamento_id, profile_id)

obrigacoes          (id, nome, departamento_id, periodicidade, dia_vencimento,
                     ajuste_dia_util, meta_dias_antes, regimes[])
cliente_obrigacoes  (cliente_id, obrigacao_id, ativo)

tarefas             (id, cliente_id, obrigacao_id, competencia, prazo_legal, prazo_meta,
                     responsavel_id, status, concluida_em, concluida_por, observacao)
tarefa_eventos      (id, tarefa_id, autor_id, tipo, dados, criado_em)     -- fase 2
tarefa_anexos       (id, tarefa_id, storage_path, nome, enviado_por)      -- fase 2
feriados            (data, escopo, uf, municipio, descricao)              -- fase 2
```

A regra `UNIQUE (cliente_id, obrigacao_id, competencia)` em `tarefas` impede
tarefas duplicadas quando a geração roda de novo.

## 5. Segurança e LGPD

- **RLS em todas as tabelas.** O colaborador só altera as tarefas dele; o gestor,
  as do seu departamento; o admin, tudo.
- A chave `service_role` nunca vai para o navegador; só é usada no servidor e no cron.
- Log de auditoria das alterações em tarefas e clientes (fase 2).
- Dados de clientes (CPF, contatos) tratados como pessoais: acesso só por usuários
  autenticados e backups do Supabase ativos.

## 6. Infraestrutura e fluxo de trabalho

- **GitHub** `plataforma-mcont`: `main` vai para produção e cada PR recebe um preview.
- **Vercel** ligada ao repositório, com as variáveis do Supabase configuradas nos
  ambientes Preview e Production.
- **Supabase** com dois projetos (`mcont-dev` e `mcont-prod`) ou branching;
  migrations versionadas em `supabase/migrations` e aplicadas pela Supabase CLI.
- Tipos TypeScript gerados a partir do banco (`supabase gen types`).

## 7. Perguntas em aberto

1. Quais departamentos existem de fato e quantas pessoas há em cada um?
2. Quantos clientes ativos, em média? (Isso define a paginação e o volume do cron.)
3. Existe uma planilha ou sistema atual de onde importar clientes e responsáveis?
4. Qual é a lista real de obrigações por regime, e quais prazos e metas internas valem hoje?
5. O colaborador deve **ver** as tarefas dos colegas do mesmo departamento ou só as dele?
6. Usar o domínio próprio na Vercel (ex.: `plataforma.mcont.com.br`)?
