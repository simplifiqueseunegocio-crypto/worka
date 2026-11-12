# Rotina: CND municipal de São José do Rio Preto (ISS Digital)

Roteiro para a tarefa agendada do Claude. Verifica, no **ISS Digital** do Portal
Cidadão de Rio Preto, se cada cliente da fila tem débitos no cadastro mobiliário
(ISS e taxas) e grava na Plataforma MCONT: **regular** ou **pendente**.

> Validado em 20/10/2026: o resultado bateu com a certidão emitida no site da
> prefeitura (cadastro com parcela vencida → certidão positiva; sem débitos →
> certidão negativa). Sem captcha, usando a sessão do gov.br aberta no Chrome.
> Em 03/11/2026: login com o e-CPF pelo próprio roteiro, sem captcha.
>
> Limites: só **Rio Preto**; só o **cadastro mobiliário** (o IPTU de imóveis
> ligados ao CNPJ não aparece); só as empresas **vinculadas ao contador** do
> login no cadastro da prefeitura.

## Antes de começar

- Pasta do projeto: `C:\src\plataforma-mcont`. Comandos da fila (rodar nessa pasta):
  - `node integracoes/cnd/fila.mjs pendentes municipal [manual] --municipio "SP/SAO JOSE DO RIO PRETO"` (só conta)
  - `node integracoes/cnd/fila.mjs gravar municipal <situacao.json> [manual] --municipio "SP/SAO JOSE DO RIO PRETO"`
    (reserva e grava a fila de Rio Preto de uma vez, pela situação lida do site)
  - O `--municipio` é obrigatório: a fila municipal tem clientes de outras
    cidades (rotina-municipal-sia.md), que esta rotina não pode pegar.
- Navegador: **Claude in Chrome** no Chrome do usuário **programador**. Antes de
  tudo, siga [rotina-chrome-govbr.md](rotina-chrome-govbr.md): escolher o Chrome
  certo e, se a sessão tiver caído, o login com certificado.
- A consulta não abre uma página por cliente: um script lê, pela API do próprio
  ISS Digital, a situação de todos os cadastros vinculados ao contador (~121, em
  ~1 minuto), e o `fila.mjs gravar` cruza com a fila. Validado em 03/11/2026.

## 1. Entrar no ISS Digital

1. Abra `https://cidadao.riopreto.sp.gov.br/empro_cidadao/sjriopreto/semfaz/empro_riopreto_digital.php/iss_digital#/`
   e espere ~8 s. Se aparecer o aviso "TAXA(S) DE LICENÇA E ISSQN FIXO", clique em **Fechar**.
2. Está logado se o topo mostrar um nome com CPF entre parênteses e a tabela
   "Meus Cadastros" aparecer.
3. Se aparecer "Acesso negado": abra `https://cidadao.riopreto.sp.gov.br/`, clique em
   **"Entrar com gov.br"** e, se cair na tela do gov.br, faça o login com
   certificado ([rotina-chrome-govbr.md](rotina-chrome-govbr.md)). Depois volte ao endereço do passo 1.

## 2. Ler a situação de todos os cadastros

1. Leia o arquivo `C:\src\plataforma-mcont\integracoes\cnd\iss-riopreto-situacao.js`
   e execute o conteúdo inteiro, sem alterar, com `javascript_tool` na aba do ISS
   Digital. Ele responde `iniciado` e continua em segundo plano. **Não navegue
   nessa aba** até terminar.
2. A cada ~20 s (`computer` com `wait`), confira com `javascript_tool`:
   ```js
   const c = window.__cnd; c.out ? 'pronto' : c.erro ? 'erro: ' + c.erro : `${c.feito}/${c.total}`
   ```
   Pare de esperar depois de 5 minutos.
3. Quando vier `pronto`, leia o resultado:
   ```js
   JSON.stringify(window.__cnd.out)
   ```
   e grave o texto, sem alterar, no arquivo
   `C:\src\plataforma-mcont\integracoes\cnd\logs\municipal-situacao.json` (ferramenta Write).
4. Se vier `erro:` ou passar de 5 minutos: não grave nada, relate o erro e encerre
   (os clientes continuam na fila para a próxima execução).

## 3. Gravar na plataforma

Rode, na pasta do projeto (com `manual` no fim só na tarefa sob demanda):

```
node integracoes/cnd/fila.mjs gravar municipal integracoes/cnd/logs/municipal-situacao.json --municipio "SP/SAO JOSE DO RIO PRETO"
```

O comando reserva só os clientes de Rio Preto que estão na fila (nunca grava
empresas da lista do ISS que não estão na fila) e, para cada um:

- documento com débito de anos anteriores ou parcela do ano vencida: **pendente**
  (com a mensagem dos cadastros);
- documento na lista sem nada vencido: **regular**;
- documento cujos débitos não carregaram: devolvido para a fila (`repetir`);
- documento fora da lista: **erro** "Fora do ISS Digital: cliente de outro
  município ou não vinculado ao contador na prefeitura de Rio Preto".

Ele imprime o resumo (`regular`, `pendente`, `erro`, `repetir` e os nomes dos
pendentes). Se der erro de conexão, relate o erro exato.

## Regras

- O único login permitido é o clique em "Seu certificado digital". Nunca digite
  CPF ou senha e nunca clique em "Sair" no portal nem no gov.br.
- Só leia: não abra protocolos, não emita guias nem certidões, não altere cadastros.
- Se aparecer captcha, não tente resolver nem contornar: pare e relate (sem gravar).
- Nunca invente resultado: a plataforma só recebe o que o `fila.mjs gravar` calcular.

## Ao terminar

Resposta final curta, em português: o resumo do `fila.mjs gravar` (regulares,
pendentes com os nomes, fora do ISS Digital, devolvidos) e se parou antes do fim
(sessão expirada, captcha, site fora do ar).
