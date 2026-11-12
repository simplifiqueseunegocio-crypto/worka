# Chrome do programador e login no gov.br

Parte comum das rotinas que usam o **Claude in Chrome** (estadual, municipal e
FGTS). Ferramentas `mcp__claude-in-chrome__*`; leia antes a skill chrome-browser.

Validado em 03/11/2026: no Chrome do usuário programador do servidor, o login
no gov.br com o e-CPF da Lidiane passa sem captcha e abre o ISS Digital e o
SIDEB logados. O Chrome apresenta o certificado sozinho pela política
`AutoSelectCertificateForUrls` (HKCU do programador).

1. **Escolha o Chrome certo.** Chame `list_connected_browsers`. Mais de um
   Chrome do servidor pode estar conectado (o de outros usuários não tem o
   e-CPF). Use `select_browser` com o deviceId `42b8ecf4-0af9-4700-ba5d-397e78ffad9a`
   (Chrome do programador). Se ele não estiver na lista, **não use outro**:
   relate "Chrome do programador não conectado" e encerre sem reservar.
2. Depois, `tabs_context_mcp` e uma aba nova; feche as abas que abrir.
3. **Login, se a sessão tiver caído:** na tela "gov.br - Acesse sua conta"
   (`sso.acesso.gov.br`), clique uma vez em **"Seu certificado digital"** e
   espere ~10 s. O site volta logado sozinho. Não digite CPF nem senha e não
   escolha certificado em janela nenhuma: só esse clique.
4. Se depois do clique aparecer captcha (desafio de imagens), tela de erro do
   Chrome, pedido de senha/PIN ou "autorizar uso de dados", **não insista**:
   devolva os clientes com `repetir <id> "login gov.br com certificado falhou: <o que apareceu>"`,
   pare e relate.

Os passos 3 e 4 só valem para as rotinas que entram pelo gov.br (estadual e municipal).
A FGTS usa só os passos 1 e 2.

## Para funcionar sem ninguém

- A sessão do Windows do **programador** precisa continuar logada (pode ficar
  desconectada do RDP, mas não pode sair), com o **Chrome** e o **app do Claude**
  abertos e a extensão Claude in Chrome conectada nesse Chrome.
- Se a extensão for reinstalada, o deviceId muda: rode `list_connected_browsers`
  numa conversa e atualize o passo 1 com o novo deviceId do Chrome do programador.
