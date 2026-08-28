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

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    method,
    headers,
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

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
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
