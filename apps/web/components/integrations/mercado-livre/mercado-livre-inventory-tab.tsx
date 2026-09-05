'use client';

import * as React from 'react';
import { Warehouse } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { StatusBadge } from '@/components/ui/status-badge';
import { STOCK_SYNC_STATUS_PRESENTATION } from '@ecommerce-manager/ui';
import { formatDate } from '@/lib/format';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  useMercadoLivreInventoryCompare,
  useMercadoLivreInventoryPushEnabled,
  usePushMercadoLivreInventory,
  useSetMercadoLivreAutoSync,
  type MercadoLivreInventoryComparisonRow,
  type MercadoLivreStatus,
} from '@/hooks/use-mercado-livre';

export function MercadoLivreInventoryTab({ status }: { status: MercadoLivreStatus }) {
  const { data, isLoading } = useMercadoLivreInventoryCompare();
  const { data: pushEnabled } = useMercadoLivreInventoryPushEnabled();
  const [confirming, setConfirming] = React.useState<MercadoLivreInventoryComparisonRow | null>(null);
  const push = usePushMercadoLivreInventory();
  const setAutoSync = useSetMercadoLivreAutoSync();

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        Modo de estoque Mercado Livre: somente comparar
        {pushEnabled?.enabled
          ? ' — envio manual habilitado nesta instalação (MERCADOLIVRE_INVENTORY_PUSH_ENABLED=true).'
          : '. Envio automático desabilitado por padrão — configure MERCADOLIVRE_INVENTORY_PUSH_ENABLED para habilitar o envio manual.'}
      </p>

      {pushEnabled?.enabled && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-border p-3">
          <Switch
            checked={Boolean(status.autoInventorySyncEnabled)}
            disabled={setAutoSync.isPending}
            onCheckedChange={(checked) => setAutoSync.mutate(checked)}
          />
          <div>
            <p className="text-sm font-medium">
              Sincronização automática {status.autoInventorySyncEnabled ? 'ativada' : 'desativada'}
            </p>
            <p className="text-xs text-muted-foreground">
              Quando ativado, alterações no estoque central são enviadas automaticamente para o Mercado Livre a cada
              poucos minutos — só afeta esta integração, não a da TikTok.
            </p>
          </div>
        </div>
      )}

      {isLoading || !data ? (
        <div className="rounded-lg border border-border">
          <TableSkeleton />
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon={Warehouse} title="Nenhum produto vinculado para comparar" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Central</TableHead>
              <TableHead>Mercado Livre</TableHead>
              <TableHead>Diferença</TableHead>
              <TableHead>Último sync</TableHead>
              <TableHead>Situação</TableHead>
              {pushEnabled?.enabled && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.variantId}>
                <TableCell>{row.sku}</TableCell>
                <TableCell>{row.central}</TableCell>
                <TableCell>{row.mercadoLivre ?? '—'}</TableCell>
                <TableCell>{row.mercadoLivre !== null ? row.central - row.mercadoLivre : '—'}</TableCell>
                <TableCell>{row.lastSyncAt ? formatDate(row.lastSyncAt, true) : '—'}</TableCell>
                <TableCell>
                  <StatusBadge status={row.status} map={STOCK_SYNC_STATUS_PRESENTATION} />
                </TableCell>
                {pushEnabled?.enabled && (
                  <TableCell className="text-right">
                    {row.divergent && (
                      <Button size="sm" variant="outline" onClick={() => setConfirming(row)}>
                        Enviar estoque central
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={Boolean(confirming)} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar estoque central ao Mercado Livre</DialogTitle>
            <DialogDescription>
              Estoque central: {confirming?.central} · Mercado Livre atual: {confirming?.mercadoLivre}
              <br />O Mercado Livre será atualizado para {confirming?.central}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Cancelar
            </Button>
            <Button
              disabled={push.isPending}
              onClick={() =>
                confirming && push.mutate(confirming.variantId, { onSuccess: () => setConfirming(null) })
              }
            >
              Confirmar envio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
