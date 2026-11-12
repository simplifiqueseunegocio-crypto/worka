import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { modoPrevia } from "@/lib/supabase/previa";

// Renova a sessão do Supabase a cada requisição e manda quem não está logado
// para /login. É só a checagem otimista: a autorização de verdade fica nas
// policies (RLS) do banco.
export async function proxy(request: NextRequest) {
  // Modo prévia (só em dev, lib/supabase/previa.ts): sem login e sem banco.
  if (modoPrevia()) {
    const { pathname } = request.nextUrl;
    if (ROTAS_PUBLICAS.includes(pathname)) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers ?? {}).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const logado = Boolean(data?.claims);
  const { pathname, search } = request.nextUrl;

  // As rotas de API se autenticam sozinhas (ex.: token da integração).
  if (pathname.startsWith("/api/")) return response;

  const publica = ROTAS_PUBLICAS.includes(pathname);

  if (!logado && !publica && !ROTAS_ABERTAS.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?proximo=${encodeURIComponent(pathname + search)}`;
    return redirecionar(url, response);
  }
  if (logado && publica) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return redirecionar(url, response);
  }

  return response;
}

// Telas de entrada: abertas sem sessão e desnecessárias para quem já entrou.
const ROTAS_PUBLICAS = ["/login", "/primeiro-acesso"];

// Abertas com ou sem sessão: o link do e-mail de definir senha pode ser
// aberto num navegador onde outra pessoa já está logada.
const ROTAS_ABERTAS = ["/definir-senha"];

// Leva junto os cookies de sessão que o Supabase possa ter renovado.
function redirecionar(url: URL, origem: NextResponse) {
  const destino = NextResponse.redirect(url);
  origem.cookies.getAll().forEach((cookie) => destino.cookies.set(cookie));
  return destino;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
