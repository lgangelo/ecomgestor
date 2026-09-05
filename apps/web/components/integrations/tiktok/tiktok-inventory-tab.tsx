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
  useTikTokInventoryCompare,
  useTikTokInventoryPushEnabled,
  usePushTikTokInventory,
  useSetTikTokAutoSync,
  type InventoryComparisonRow,
  type TikTokStatus,
} from '@/hooks/use-tiktok';

export function TikTokInventoryTab({ status }: { status: TikTokStatus }) {
  const { data, isLoading } = useTikTokInventoryCompare();
  const { data: pushEnabled } = useTikTokInventoryPushEnabled();
  const [confirming, setConfirming] = React.useState<InventoryComparisonRow | null>(null);
  const push = usePushTikTokInventory();
  const setAutoSync = useSetTikTokAutoSync();

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        Modo de estoque TikTok: somente comparar
        {pushEnabled?.enabled
          ? ' — envio manual habilitado nesta instalação (TIKTOK_INVENTORY_PUSH_ENABLED=true).'
          : '. Envio automático desabilitado por padrão — configure TIKTOK_INVENTORY_PUSH_ENABLED para habilitar o envio manual.'}
      </p>

      {pushEnabled?.enabled && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-border p-3">
          <Switch
            checked={Boolean(status.autoInventorySyncEnabled)}
            disabled={setAutoSync.isPending}
            onCheckedChange={(checked) => setAutoSync.mutate({ enabled: checked })}
          />
          <div>
            <p className="text-sm font-medium">
              Sincronização automática {status.autoInventorySyncEnabled ? 'ativada' : 'desativada'}
            </p>
            <p className="text-xs text-muted-foreground">
              Quando ativado, alterações no estoque central são enviadas automaticamente para a TikTok Shop a cada
              poucos minutos — só afeta esta integração, não a do Mercado Livre.
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
              <TableHead>TikTok</TableHead>
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
                <TableCell>{row.tiktok ?? '—'}</TableCell>
                <TableCell>{row.tiktok !== null ? row.central - row.tiktok : '—'}</TableCell>
                <TableCell>{row.lastSyncAt ? formatDate(row.lastSyncAt, true) : '—'}</TableCell>
                <TableCell>
                  {/* Achado real: antes só o badge "Erro" aparecia, sem nenhum detalhe do motivo
                      — o `title` mostra a mensagem real salva no outbox ao passar o mouse. */}
                  <span title={row.status === 'ERRO' ? (row.lastError ?? undefined) : undefined}>
                    <StatusBadge status={row.status} map={STOCK_SYNC_STATUS_PRESENTATION} />
                  </span>
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
            <DialogTitle>Enviar estoque central ao TikTok</DialogTitle>
            <DialogDescription>
              Estoque central: {confirming?.central} · TikTok atual: {confirming?.tiktok}
              <br />O TikTok será atualizado para {confirming?.central}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Cancelar
            </Button>
            <Button
              disabled={push.isPending}
              onClick={() =>
                confirming &&
                push.mutate({ variantId: confirming.variantId }, { onSuccess: () => setConfirming(null) })
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
