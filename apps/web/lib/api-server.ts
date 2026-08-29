import { cookies } from 'next/headers';

// Fetch de servidor-para-servidor (dentro da rede Docker) — nunca deve depender do domínio
// público (NEXT_PUBLIC_API_URL, usado pelo navegador): DNS/TLS podem não estar prontos ainda,
// e muitos provedores bloqueiam "hairpin NAT" (o próprio servidor não consegue se auto-acessar
// pelo domínio público). API_INTERNAL_URL aponta para o nome do serviço no docker-compose.yml
// (resolução interna do Docker), com fallback para NEXT_PUBLIC_API_URL fora de containers.
const API_BASE_URL = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

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
