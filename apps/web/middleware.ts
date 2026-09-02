import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, REFRESH_COOKIE_NAME } from '@ecommerce-manager/shared';

const API_BASE_URL = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

/**
 * `apps/web/app/(app)/layout.tsx` roda num Server Component, que nunca consegue setar cookie na
 * resposta (só Middleware/Route Handler/Server Action conseguem) — então, sem isto, um usuário
 * que navega entre páginas depois dos 30 min do token de acesso via só `/auth/me` dar 401 e cair
 * pro login "do nada", mesmo com o refresh token (30 dias) ainda válido. Este middleware roda
 * ANTES do layout: se o cookie de acesso já sumiu mas o de refresh ainda existe, tenta renovar a
 * sessão em silêncio e repassa os novos cookies antes da página renderizar — o usuário nunca vê a
 * tela de login por causa só de ter ficado inativo por menos que o refresh token permite.
 */
export async function middleware(request: NextRequest) {
  const hasAccessToken = request.cookies.has(AUTH_COOKIE_NAME);
  const hasRefreshToken = request.cookies.has(REFRESH_COOKIE_NAME);

  // Já tem token de acesso válido, ou nem tem refresh token pra tentar renovar (nunca logou, ou
  // o navegador já foi fechado e os cookies de sessão sumiram de verdade) — deixa o layout normal
  // decidir (ele já redireciona pro /login sozinho quando `/auth/me` falhar).
  if (hasAccessToken || !hasRefreshToken) {
    return NextResponse.next();
  }

  const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { cookie: request.headers.get('cookie') ?? '' },
  });

  if (!refreshResponse.ok) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('expired', '1');
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();
  for (const setCookie of refreshResponse.headers.getSetCookie()) {
    response.headers.append('set-cookie', setCookie);
  }
  return response;
}

export const config = {
  // Roda em toda navegação de página, exceto a própria tela de login, assets do Next e a
  // chamada de API do navegador (que já tem sua própria renovação em `lib/api-client.ts`).
  matcher: ['/((?!login|api|_next/static|_next/image|favicon.ico).*)'],
};
