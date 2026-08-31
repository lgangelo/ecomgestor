'use client';

import * as React from 'react';
import { Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-client';
import { uploadFiscalDocumentRequest } from '@/hooks/use-fiscal';

const TYPES = [
  { value: 'SALE_INVOICE', label: 'NF-e de venda' },
  { value: 'RETURN_INVOICE', label: 'NF-e de devolução' },
  { value: 'CANCELLATION', label: 'Cancelamento' },
  { value: 'OTHER', label: 'Outro' },
];

interface FileResult {
  fileName: string;
  status: 'pending' | 'auto' | 'manual' | 'error';
  message?: string;
}

/** Envio em lote — baixa vários XMLs de uma vez (ex.: exportação mensal da TikTok) em vez de um
 * por um. Cada arquivo é enviado sequencialmente (nunca em paralelo — evita sobrecarregar o
 * upload e mantém a ordem dos resultados previsível); associação automática funciona igual ao
 * envio único, já que usa a mesma chamada por baixo. */
export function FiscalBulkUploadDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [files, setFiles] = React.useState<File[]>([]);
  const [type, setType] = React.useState('SALE_INVOICE');
  const [uploading, setUploading] = React.useState(false);
  const [results, setResults] = React.useState<FileResult[]>([]);
  const queryClient = useQueryClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) return;
    setUploading(true);
    const nextResults: FileResult[] = [];
    for (const file of files) {
      try {
        const result = await uploadFiscalDocumentRequest({ file, type });
        nextResults.push({
          fileName: file.name,
          status: result.autoAssociated ? 'auto' : result.orderId ? 'auto' : 'manual',
        });
      } catch (error) {
        nextResults.push({
          fileName: file.name,
          status: 'error',
          message: error instanceof ApiError ? error.message : 'Falha no envio',
        });
      }
      setResults([...nextResults]);
    }
    setUploading(false);
    queryClient.invalidateQueries({ queryKey: ['fiscal-documents'] });
    queryClient.invalidateQueries({ queryKey: ['fiscal-pending'] });
  }

  function handleClose(nextOpen: boolean) {
    if (uploading) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      setFiles([]);
      setResults([]);
    }
  }

  const autoCount = results.filter((r) => r.status === 'auto').length;
  const manualCount = results.filter((r) => r.status === 'manual').length;
  const errorCount = results.filter((r) => r.status === 'error').length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar vários XMLs de uma vez</DialogTitle>
          <DialogDescription>
            Selecione todos os arquivos baixados da TikTok — cada um é enviado e associado automaticamente quando
            possível, igual ao envio individual.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bulk-files">Arquivos XML</Label>
            <Input
              id="bulk-files"
              type="file"
              accept=".xml,application/xml,text/xml"
              multiple
              required
              disabled={uploading}
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            {files.length > 0 && <p className="text-xs text-muted-foreground">{files.length} arquivo(s) selecionado(s).</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de documento</Label>
            <Select value={type} onValueChange={setType} disabled={uploading}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {results.length > 0 && (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2 text-sm">
              {results.map((r) => (
                <div key={r.fileName} className="flex items-center justify-between gap-2">
                  <span className="truncate">{r.fileName}</span>
                  <span
                    className={
                      r.status === 'auto'
                        ? 'text-success'
                        : r.status === 'error'
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                    }
                  >
                    {r.status === 'auto' && 'associado'}
                    {r.status === 'manual' && 'sem associação'}
                    {r.status === 'error' && (r.message ?? 'erro')}
                  </span>
                </div>
              ))}
            </div>
          )}
          {!uploading && results.length > 0 && results.length === files.length && (
            <p className="text-sm text-muted-foreground">
              {autoCount} associado(s) automaticamente, {manualCount} precisam de associação manual, {errorCount} com erro.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={uploading}>
              {results.length === files.length && results.length > 0 ? 'Fechar' : 'Cancelar'}
            </Button>
            <Button type="submit" disabled={files.length === 0 || uploading}>
              <Upload className="h-4 w-4" />
              {uploading ? `Enviando ${results.length}/${files.length}...` : `Enviar ${files.length || ''} arquivo(s)`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
