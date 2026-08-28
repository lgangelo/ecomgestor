'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch, apiUrl } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type { Paginated } from '@/lib/types/pagination';
import { toast } from '@/components/ui/use-toast';

export interface FiscalDocumentListItem {
  id: string;
  orderId: string | null;
  customerName: string | null;
  channelName: string | null;
  type: string;
  number: string | null;
  series: string | null;
  status: string;
  issueDate: string | null;
}

const CSRF_COOKIE_NAME = 'ecm_csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';

function readCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

async function downloadBlob(url: string, filenameFallback: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const csrf = readCookie(CSRF_COOKIE_NAME);
  if (init?.method && init.method !== 'GET' && csrf) headers.set(CSRF_HEADER_NAME, csrf);
  if (init?.body !== undefined) headers.set('Content-Type', 'application/json');

  const response = await fetch(url, { ...init, headers, credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Falha ao baixar arquivo (${response.status})`);
  }
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const filename = match?.[1] ?? filenameFallback;

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

export function useFiscalDocuments(filters: {
  orderId?: string;
  type?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}) {
  const query = buildQueryString({ page: filters.page ?? 1, pageSize: filters.pageSize ?? 20, ...filters });
  return useQuery({
    queryKey: ['fiscal-documents', filters],
    queryFn: () => apiFetch<Paginated<FiscalDocumentListItem>>(`/fiscal/documents${query}`),
  });
}

export function useDownloadFiscalXml() {
  return useMutation({
    mutationFn: (documentId: string) =>
      downloadBlob(apiUrl(`/fiscal/documents/${documentId}/xml`), `nfe-${documentId}.xml`),
    onError: () =>
      toast({ title: 'Não foi possível baixar o XML', variant: 'destructive' }),
  });
}

export function useExportFiscalDocuments() {
  return useMutation({
    mutationFn: (ids: string[]) =>
      downloadBlob(apiUrl('/fiscal/documents/export'), 'documentos-fiscais.zip', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
    onSuccess: () => toast({ title: 'Download iniciado.' }),
    onError: () => toast({ title: 'Não foi possível gerar o arquivo de exportação', variant: 'destructive' }),
  });
}
