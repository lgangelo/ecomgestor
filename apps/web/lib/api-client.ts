'use client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
const CSRF_COOKIE_NAME = 'ecm_csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

// Rotas de autenticação nunca disparam a renovação silenciosa nem o redirect por 401 — um 401
// em `/auth/login` é só "senha errada" (tratado no form), e um 401 em `/auth/refresh` É a
// própria tentativa de renovação falhando (aí sim a sessão acabou de verdade).
const AUTH_PATHS = new Set(['/auth/login', '/auth/refresh']);

// Evita disparar vários POSTs /auth/refresh em paralelo quando várias chamadas da tela levam
// 401 ao mesmo tempo (ex.: dashboard com 4 hooks buscando dados juntos) — todas esperam a MESMA
// promise em vez de cada uma tentar renovar a sessão por conta própria.
let refreshPromise: Promise<boolean> | null = null;

async function silentRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function doFetch(path: string, method: string, headers: Headers, options: ApiFetchOptions) {
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    method,
    headers,
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

/**
 * Wrapper de fetch usado por todas as páginas/hook de dados do app. Sempre envia
 * cookies (sessão httpOnly) e, em requisições que alteram estado, espelha o cookie
 * CSRF no header x-csrf-token (padrão double-submit).
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (MUTATING_METHODS.has(method)) {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken) headers.set(CSRF_HEADER_NAME, csrfToken);
  }

  let response = await doFetch(path, method, headers, options);

  // O token de acesso dura só 30 min — sem isso, qualquer clique feito depois desse tempo
  // (mesmo com o usuário ativo o tempo todo) derrubava pra tela de login "do nada". Antes de
  // desistir, tenta renovar a sessão em silêncio (usa o refresh token, cookie separado) e refaz
  // a MESMA chamada uma vez — só cai pro login se a renovação também falhar (aí a sessão
  // realmente não existe mais: token de refresh vencido/revogado ou navegador fechado).
  if (response.status === 401 && !AUTH_PATHS.has(path)) {
    const renewed = await silentRefresh();
    if (renewed) {
      response = await doFetch(path, method, headers, options);
    }
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json() : undefined;

  if (!response.ok) {
    const message =
      (payload && typeof payload === 'object' && 'message' in payload
        ? Array.isArray(payload.message)
          ? payload.message.join(', ')
          : String(payload.message)
        : undefined) ?? `Erro na requisição (${response.status})`;

    // Chegou aqui com 401 mesmo depois da tentativa de renovação acima (ou numa rota de auth,
    // que nunca tenta renovar) — aí sim a sessão acabou de verdade.
    if (response.status === 401 && path !== '/auth/login' && typeof window !== 'undefined') {
      window.location.href = '/login?expired=1';
    }

    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
