// Notas de atualização da plataforma, da mais nova para a mais antiga.
// Ao subir uma versão, acrescente uma entrada no topo: o menu passa a mostrar
// o ponto de "novidade" para quem ainda não abriu a tela.
//
// Escreva para a equipe do escritório: o que mudou no dia a dia, sem termos técnicos.

export type TipoItem = "novo" | "melhoria" | "correcao";

export type ItemNovidade = { tipo: TipoItem; texto: string; href?: string };

export type Versao = {
  versao: string;
  data: string; // AAAA-MM-DD
  titulo: string;
  resumo: string;
  itens: ItemNovidade[];
};

export const novidades: Versao[] = [
  {
    versao: "1.5",
    data: "2026-11-10",
    titulo: "Automações",
    resumo:
      "Uma tela nova reúne tudo o que a plataforma faz sozinha, e seis avisos por e-mail passam a chegar no dia a dia da equipe.",
    itens: [
      {
        tipo: "novo",
        texto: "Tela Automações: cada rotina mostra quando roda, o que fez na última vez, quando é a próxima e se pede atenção. Tem busca.",
        href: "/automacoes",
      },
      {
        tipo: "novo",
        texto:
          "Resumo diário por e-mail: de segunda a sexta, às 7h, cada pessoa recebe as suas tarefas atrasadas, as que vencem hoje e as dos próximos 7 dias. Dá para enviar uma prévia para si mesmo na tela Automações.",
      },
      {
        tipo: "novo",
        texto:
          "Mudança na situação da CND: aviso por e-mail quando um cliente regular passa a ter pendência numa certidão, ou quando regulariza.",
      },
      {
        tipo: "novo",
        texto:
          "Alerta de atraso para o gestor: cada gestor recebe as tarefas dos seus departamentos que passaram da meta interna, com o total por responsável.",
      },
      {
        tipo: "novo",
        texto:
          "CND perto de vencer: aviso 15 dias antes do vencimento das certidões lançadas, já com uma nova consulta automática na fila.",
      },
      {
        tipo: "novo",
        texto:
          "Lembrete de cobrança: tarefa parada em “aguardando cliente” por 3 dias úteis gera um lembrete para o responsável, com os contatos do cliente. Nada é enviado ao cliente.",
      },
      {
        tipo: "novo",
        texto:
          "Conferência na Receita: todo dia a plataforma confere um lote de CNPJs e avisa se um cliente ficou inapto, foi baixado, saiu do Simples ou mudou de CNAE ou endereço.",
      },
      { tipo: "melhoria", texto: "Os e-mails não saem em fins de semana nem em feriados nacionais." },
      {
        tipo: "novo",
        texto:
          "Certificado digital em Configurações: baixe o certificado A1 da empresa quando precisar instalar. A senha não fica na plataforma, e cada download fica registrado.",
        href: "/configuracoes/certificado",
      },
      {
        tipo: "novo",
        texto:
          "Base do robô do DET: os avisos de consignado lidos no DET passam a virar tarefa para o responsável do DP do cliente. O robô entra em funcionamento em breve.",
      },
      {
        tipo: "novo",
        texto:
          "Feriados em Configurações: veja os feriados de cada ano e, se for admin, cadastre estaduais e municipais ou importe os nacionais do ano com um clique.",
        href: "/configuracoes/feriados",
      },
      { tipo: "novo", texto: "Tela Novidades, em Configurações, para acompanhar o que muda a cada versão.", href: "/configuracoes/novidades" },
    ],
  },
  {
    versao: "1.4",
    data: "2026-11-09",
    titulo: "Tarefas pessoais e certidões lançadas",
    resumo: "Lembretes próprios, tarefas sem dono mais fáceis de assumir e as certidões emitidas guardadas no cliente.",
    itens: [
      {
        tipo: "novo",
        texto: "Tarefas pessoais: lembretes só seus, com repetição mensal ou anual, em Minhas tarefas.",
        href: "/minhas-tarefas",
      },
      { tipo: "novo", texto: "“Pegar para mim”: assuma as tarefas sem responsável dos seus departamentos com um clique.", href: "/tarefas" },
      {
        tipo: "novo",
        texto: "Certidões lançadas: registre a certidão emitida (situação, validade e PDF) na ficha do cliente.",
        href: "/clientes",
      },
      { tipo: "novo", texto: "Escolha, em cada cliente, quais tipos de certidão acompanhar." },
      { tipo: "novo", texto: "A situação do cliente (ativo, suspenso, encerrado) pode ser alterada pela tela." },
      {
        tipo: "melhoria",
        texto: "Quando a empresa sai do Domínio, as tarefas que ainda estavam em aberto são apagadas. As concluídas ficam no histórico.",
      },
    ],
  },
  {
    versao: "1.3",
    data: "2026-11-05",
    titulo: "Calendário, relatórios e envio do adiantamento",
    resumo: "Visão do mês, indicadores da equipe e a folha de adiantamento indo por e-mail direto da plataforma.",
    itens: [
      { tipo: "novo", texto: "Calendário com os vencimentos do mês e os feriados.", href: "/calendario" },
      { tipo: "novo", texto: "Relatórios de pontualidade, produtividade e atrasos por cliente, com exportação.", href: "/relatorios" },
      { tipo: "novo", texto: "Folha de adiantamento: os PDFs exportados do Domínio são separados e enviados por e-mail a cada cliente.", href: "/adiantamento" },
      { tipo: "novo", texto: "Criar tarefa avulsa pela tela.", href: "/tarefas" },
      { tipo: "melhoria", texto: "Início e menu com os números reais da equipe." },
      { tipo: "melhoria", texto: "Certidões: ordenar por pendências ou por nome, e cobertura por estado e município." },
      { tipo: "melhoria", texto: "Nome do município no lugar do código, e a certidão federal das filiais consultada pela matriz." },
      { tipo: "correcao", texto: "FGTS de CNPJs que a Caixa não verifica deixam de aparecer como erro." },
    ],
  },
  {
    versao: "1.2",
    data: "2026-10-28",
    titulo: "Tarefas, equipe e obrigações",
    resumo: "O coração da plataforma: as obrigações de cada cliente viram tarefas com prazo e responsável.",
    itens: [
      { tipo: "novo", texto: "Catálogo de obrigações com prazo legal, meta interna e regimes.", href: "/obrigacoes" },
      { tipo: "novo", texto: "Tarefas por competência, geradas todo dia 1º, com status e responsável.", href: "/tarefas" },
      { tipo: "novo", texto: "Minhas tarefas: o que é seu, separado por atrasadas, semana e aguardando cliente.", href: "/minhas-tarefas" },
      { tipo: "novo", texto: "Equipe: convite por e-mail com link para a pessoa definir a própria senha.", href: "/configuracoes/equipe" },
    ],
  },
  {
    versao: "1.1",
    data: "2026-10-21",
    titulo: "Certidões (CND)",
    resumo: "A situação de regularidade dos clientes consultada automaticamente.",
    itens: [
      { tipo: "novo", texto: "Tela de certidões com a situação federal, FGTS, estadual e municipal de cada cliente.", href: "/cnd" },
      { tipo: "novo", texto: "Rodada mensal automática e consulta sob demanda dos clientes selecionados." },
      { tipo: "novo", texto: "Estadual de SP pelo SIDEB e municipal de Rio Preto pelo ISS Digital." },
      { tipo: "novo", texto: "Envio de e-mails pela plataforma, com e-mail de teste em Configurações.", href: "/configuracoes/email" },
      { tipo: "melhoria", texto: "Certidão federal válida que já existe conta como regular." },
    ],
  },
  {
    versao: "1.0",
    data: "2026-10-16",
    titulo: "Lançamento",
    resumo: "Primeira versão da plataforma.",
    itens: [
      { tipo: "novo", texto: "Acesso com e-mail e senha." },
      { tipo: "novo", texto: "Carteira de clientes sincronizada todo dia com o Domínio, inclusive o regime tributário.", href: "/clientes" },
      { tipo: "novo", texto: "Log de sincronização em Configurações.", href: "/configuracoes/sincronizacao" },
    ],
  },
];

export const VERSAO_ATUAL = novidades[0].versao;
export const CHAVE_VISTA = "mcont:novidades-vista";
