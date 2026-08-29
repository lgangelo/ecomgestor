'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiUrl, ApiError } from '@/lib/api-client';
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
  sourceType: 'UPLOADED' | 'GENERATED';
  issueDate: string | null;
}

/** Preview do mês antes do download (seção 12 da Fase 4) — nunca finge que o pacote está completo. */
export interface FiscalMonthlySummary {
  referenceMonth: string;
  documentsCount: number;
  saleInvoiceCount: number;
  returnInvoiceCount: number;
  xmlAvailableCount: number;
  xmlUnavailableCount: number;
}

export interface FiscalPending {
  salesWithoutInvoice: Array<{
    orderId: string;
    orderDate: string;
    customerName: string | null;
    channelName: string;
    total: string;
  }>;
  returnsWithoutDocument: Array<{ id: string; orderId: string; customerName: string | null }>;
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

export function useFiscalMonthlySummary(referenceMonth: string, channelId?: string) {
  const query = buildQueryString({ referenceMonth, channelId });
  return useQuery({
    queryKey: ['fiscal-monthly-summary', referenceMonth, channelId],
    queryFn: () => apiFetch<FiscalMonthlySummary>(`/fiscal/monthly-summary${query}`),
    enabled: Boolean(referenceMonth),
  });
}

/** Ação principal da Fase 4 (seção 11) — "Baixar XMLs para contabilidade". */
export function useDownloadMonthlyFiscalExport() {
  return useMutation({
    mutationFn: ({ referenceMonth, channelId }: { referenceMonth: string; channelId?: string }) => {
      const query = buildQueryString({ referenceMonth, channelId });
      return downloadBlob(apiUrl(`/fiscal/monthly-export${query}`), `fiscal-${referenceMonth}.zip`);
    },
    onSuccess: () => toast({ title: 'Download iniciado.' }),
    onError: (error) =>
      toast({
        title: 'Não foi possível gerar o pacote de XMLs',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      }),
  });
}

export function useFiscalPending() {
  return useQuery({
    queryKey: ['fiscal-pending'],
    queryFn: () => apiFetch<FiscalPending>('/fiscal/pending'),
  });
}

export function useUploadFiscalDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, type, orderId }: { file: File; type: string; orderId?: string }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);
      if (orderId) formData.append('orderId', orderId);

      const csrf = readCookie(CSRF_COOKIE_NAME);
      const response = await fetch(apiUrl('/fiscal/documents/upload'), {
        method: 'POST',
        credentials: 'include',
        headers: csrf ? { [CSRF_HEADER_NAME]: csrf } : undefined,
        body: formData,
      });
      const payload = await response.json().catch(() => undefined);
      if (!response.ok) {
        const message = payload && typeof payload.message === 'string' ? payload.message : 'Falha no upload';
        throw new ApiError(message, response.status, payload);
      }
      return payload as { id: string; autoAssociated: boolean; orderId: string | null };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-documents'] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-pending'] });
      toast({
        title: 'XML enviado com sucesso.',
        description: result.autoAssociated
          ? 'Associado automaticamente a um pedido.'
          : result.orderId
            ? undefined
            : 'Não foi possível associar automaticamente — associe manualmente a um pedido.',
      });
    },
    onError: (error) =>
      toast({
        title: 'Não foi possível enviar o XML',
        description: error instanceof ApiError ? error.message : undefined,
        variant: 'destructive',
      }),
  });
}

export function useAssociateFiscalDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, orderId }: { documentId: string; orderId: string }) =>
      apiFetch(`/fiscal/documents/${documentId}/associate`, { method: 'PATCH', body: { orderId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-documents'] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-pending'] });
      toast({ title: 'Documento associado ao pedido.' });
    },
    onError: (error) =>
      toast({
        title: 'Não foi possível associar o documento',
        description: error instanceof ApiError ? error.message : undefined,
        variant: 'destructive',
      }),
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
