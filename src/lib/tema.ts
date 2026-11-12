// Tema claro/escuro da interface. A preferência fica no navegador (por pessoa
// e por dispositivo); "sistema" segue o sistema operacional.

export type Tema = "claro" | "escuro" | "sistema";

export const CHAVE_TEMA = "worka:tema";
export const EVENTO_TEMA = "worka:tema";

// Roda no <head> antes da primeira pintura (app/layout.tsx), para a página
// não piscar no tema errado. Precisa ser autocontido: vira texto.
export const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem("${CHAVE_TEMA}");var e=t==="escuro"||(t!=="claro"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",e)}catch(_){}})()`;
