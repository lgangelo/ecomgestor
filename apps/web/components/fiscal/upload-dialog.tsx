'use client';

import * as React from 'react';
import { Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUploadFiscalDocument } from '@/hooks/use-fiscal';

const TYPES = [
  { value: 'SALE_INVOICE', label: 'NF-e de venda' },
  { value: 'RETURN_INVOICE', label: 'NF-e de devolução' },
  { value: 'CANCELLATION', label: 'Cancelamento' },
  { value: 'OTHER', label: 'Outro' },
];

export function FiscalUploadDialog({ trigger }: { trigger: React.ReactElement }) {
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [type, setType] = React.useState('SALE_INVOICE');
  const [orderId, setOrderId] = React.useState('');
  const upload = useUploadFiscalDocument();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    await upload.mutateAsync({ file, type, orderId: orderId || undefined });
    setOpen(false);
    setFile(null);
    setOrderId('');
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger as any}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar XML fiscal</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="file">Arquivo XML</Label>
            <Input
              id="file"
              type="file"
              accept=".xml,application/xml,text/xml"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de documento</Label>
            <Select value={type} onValueChange={setType}>
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
          <div className="space-y-1.5">
            <Label htmlFor="orderId">ID do pedido (opcional)</Label>
            <Input
              id="orderId"
              placeholder="Deixe em branco para tentar associar automaticamente"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!file || upload.isPending}>
              <Upload className="h-4 w-4" />
              {upload.isPending ? 'Enviando...' : 'Enviar XML'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
