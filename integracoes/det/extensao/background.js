// Fala com a Plataforma MCONT em nome da guia do DET. Usa a sessão de quem está
// logado na plataforma neste navegador (cookies), por isso a chamada sai daqui
// e não da página do DET.

chrome.runtime.onMessage.addListener((msg, _remetente, responder) => {
  if (msg?.tipo !== "api") return false;
  chamar(msg.plataforma, msg.corpo).then(responder, (e) => responder({ status: 0, corpo: { erro: e.message } }));
  return true; // resposta assíncrona
});

async function chamar(plataforma, corpo) {
  const base = String(plataforma || "").replace(/\/+$/, "");
  if (!/^https?:\/\//.test(base)) return { status: 0, corpo: { erro: "Informe o endereço da plataforma." } };
  const resposta = await fetch(`${base}/api/det/extensao`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-Robo-Det": "1" },
    body: JSON.stringify(corpo),
  });
  const json = await resposta.json().catch(() => ({ erro: `A plataforma respondeu ${resposta.status} sem JSON (endereço certo?).` }));
  return { status: resposta.status, corpo: json };
}
