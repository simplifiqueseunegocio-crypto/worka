// MODO PRÉVIA — só para ver a interface sem banco de dados.
//
// Liga com NEXT_PUBLIC_WORKA_PREVIA=1 e SÓ funciona em `next dev`
// (NODE_ENV=development). Em build de produção/Vercel nunca ativa.
// Com ele ligado: não há tela de login (entra como um admin fictício) e toda
// consulta ao Supabase responde vazio. Nada é lido nem gravado de verdade.
// Para remover: apague este arquivo e os blocos `if (modoPrevia())` em
// lib/supabase/{server,client,admin}.ts e src/proxy.ts.

export function modoPrevia() {
  return process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_WORKA_PREVIA === "1";
}

const USUARIO = {
  id: "00000000-0000-0000-0000-000000000000",
  email: "previa@worka.local",
};

const PERFIL = { id: USUARIO.id, nome: "Usuário Prévia", email: USUARIO.email, papel: "admin", ativo: true, profile_departamentos: [] };

type Resultado = { data: unknown; error: null; count: number; status: number; statusText: string };

const ok = (data: unknown): Resultado => ({ data, error: null, count: 0, status: 200, statusText: "OK" });

// Consulta encadeável (from().select().eq()...): qualquer método devolve a
// própria consulta; ao ser aguardada, resolve com lista vazia (ou o perfil
// fictício, quando a tabela é "profiles" e pede um registro só).
function consulta(tabela: string) {
  let um = false;
  const resolver = (): Resultado =>
    ok(tabela === "profiles" ? (um ? PERFIL : [PERFIL]) : um ? null : []);

  const alvo = new Proxy(function () {}, {
    get(_, prop) {
      if (prop === "then") {
        return (res: (r: Resultado) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(resolver()).then(res, rej);
      }
      if (prop === "single" || prop === "maybeSingle") {
        um = true;
      }
      return () => alvo;
    },
  });
  return alvo;
}

const armazenamento = {
  from: () => ({
    upload: async () => ok({ path: "previa" }),
    download: async () => ok(null),
    remove: async () => ok([]),
    createSignedUrl: async () => ok({ signedUrl: "#" }),
    createSignedUploadUrl: async () => ok({ signedUrl: "#", token: "previa", path: "previa" }),
    uploadToSignedUrl: async () => ok({ path: "previa" }),
    getPublicUrl: () => ({ data: { publicUrl: "#" } }),
    list: async () => ok([]),
  }),
};

const autenticacao = {
  getClaims: async () => ok({ claims: { sub: USUARIO.id, email: USUARIO.email } }),
  getUser: async () => ok({ user: { id: USUARIO.id, email: USUARIO.email } }),
  getSession: async () => ok({ session: null }),
  signInWithPassword: async () => ok({ user: null, session: null }),
  signOut: async () => ({ error: null }),
  updateUser: async () => ok({ user: null }),
  verifyOtp: async () => ok({ user: null, session: null }),
  admin: new Proxy({}, { get: () => async () => ok({ user: null, users: [] }) }),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function clientePrevia(): any {
  return {
    from: (tabela: string) => consulta(tabela),
    rpc: () => consulta("rpc"),
    auth: autenticacao,
    storage: armazenamento,
  };
}
