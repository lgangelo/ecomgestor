import { cookies } from 'next/headers';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

/**
 * Fetch para uso em Server Components/Route Handlers: encaminha os cookies da
 * requisição atual (sessão httpOnly) para a API, já que o fetch do servidor não tem
 * acesso automático aos cookies do navegador.
 */
export async function apiServerFetch<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  const cookieHeader = cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { ...init.headers, cookie: cookieHeader },
    cache: 'no-store',
  });

  if (!response.ok) return null;
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return null;
  return (await response.json()) as T;
}
