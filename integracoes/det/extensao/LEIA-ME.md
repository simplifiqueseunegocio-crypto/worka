# Robô do DET (extensão do Chrome)

Lê a **lista** da Caixa Postal do DET das empresas na fila da Plataforma MCONT,
na guia do DET em que você já entrou. **Nunca abre mensagens** (abrir registra
ciência no DET).

## Instalar (uma vez, no Chrome que tem o certificado)

1. Abra `chrome://extensions`.
2. Ligue **Modo do desenvolvedor** (canto superior direito).
3. **Carregar sem compactação** → escolha esta pasta (`integracoes/det/extensao`).

Depois de atualizar os arquivos, clique em ↻ no card da extensão.

## Usar

1. Entre na **Plataforma MCONT** neste Chrome (gestor ou admin).
2. Na plataforma, em Automações → Robô do DET, clique em **Iniciar** (ou espere o dia 26).
3. Abra https://det.sit.trabalho.gov.br e entre com gov.br → **Seu certificado digital**.
4. No painel **Robô do DET · MCONT** (canto inferior direito), na primeira vez,
   informe o endereço da plataforma (ex.: `http://localhost:3000` ou o endereço publicado).
5. Clique em **Ler a fila**. Deixe a guia aberta e na frente até terminar
   (cerca de 3 a 5 segundos por empresa). **Parar** encerra depois da empresa atual;
   as que ficaram voltam para a fila.

O resultado aparece na plataforma: painel por empresa, pendências, Excel e as
tarefas do DP para cada aviso novo de consignado.

## Como funciona

- `painel.js`: o painel e o laço (reserva lotes de 10 na plataforma, lê, devolve).
- `det-caixa-postal.js`: na página do DET, troca o perfil (Procurador → CNPJ/CPF
  → Selecionar), abre o card Caixa Postal e lê a lista da 1ª página. Se o DET
  mudar a tela, é aqui que se ajusta.
- `background.js`: chama `POST /api/det/extensao` com a sessão de quem está logado
  na plataforma neste Chrome. Nenhum token ou senha fica guardado.
