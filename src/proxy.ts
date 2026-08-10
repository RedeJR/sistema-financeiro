import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Checagem barata (só olha se o cookie de sessão existe) pra redirecionar
// rápido quem não está logado, sem bater no banco aqui. A checagem de
// verdade — sessão válida, usuário ativo, permissão por módulo — acontece
// em cada página/Server Action via exigirUsuario()/exigirPermissao()
// (src/lib/auth.ts). Essa função não substitui aquela, só evita mostrar a
// tela por um instante antes do redirect.
//
// De propósito, NÃO redireciona quem já tem cookie pra longe de /login: o
// cookie pode estar "morto" (sessão apagada, expirada, usuário desativado)
// e só a página /login sabe validar isso de verdade — ela mesma já
// redireciona pra "/" se a sessão for válida. Fazer essa mesma checagem
// aqui, sem bater no banco, prendia quem tinha cookie morto num loop entre
// a página protegida e "/", sem nunca conseguir ver o formulário de login.
const ROTAS_PUBLICAS = ["/login", "/esqueci-senha"];

export function proxy(request: NextRequest) {
  const temSessao = request.cookies.has("sessao");
  const { pathname } = request.nextUrl;
  const rotaPublica =
    ROTAS_PUBLICAS.includes(pathname) || pathname.startsWith("/redefinir-senha/");

  if (!temSessao && !rotaPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
