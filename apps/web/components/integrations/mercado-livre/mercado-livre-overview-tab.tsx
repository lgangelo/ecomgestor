'use client';

import { ShoppingBag, PackageCheck, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { INTEGRATION_AREA_STATUS_PRESENTATION } from '@ecommerce-manager/ui';
import { formatDate } from '@/lib/format';
import type { MercadoLivreStatus } from '@/hooks/use-mercado-livre';

function timeAgo(iso?: string | null): string {
  if (!iso) return 'nunca sincronizado';
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'agora mesmo';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.round(hours / 24)} d`;
}

export function MercadoLivreOverviewTab({ status }: { status: MercadoLivreStatus }) {
  const areas = status.areas;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Loja</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm font-medium">{status.storeName ?? 'Não conectada'}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Última sincronização</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm font-medium">
            {status.lastSyncAt ? formatDate(status.lastSyncAt, true) : 'Nunca sincronizado'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Produtos publicados</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-2xl font-semibold">{status.publishedProductCount ?? 0}</CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Pedidos importados (24h)</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-0 text-2xl font-semibold">{status.last24h?.ordersImported ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Auto-sync de estoque</CardTitle>
            <PackageCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-0 text-sm font-medium">
            {status.autoInventorySyncEnabled ? 'Ligado' : 'Desligado'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Falhas (24h)</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-0 text-2xl font-semibold">{status.last24h?.failures ?? 0}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Saúde da integração</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 pt-0 sm:grid-cols-3">
          {areas &&
            (
              [
                ['OAuth', areas.oauth],
                ['Pedidos', areas.orders],
                ['Produtos', areas.products],
                ['Estoque', areas.inventory],
                ['Fiscal', areas.fiscal],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <span className="text-sm text-muted-foreground">{label}</span>
                <StatusBadge status={value} map={INTEGRATION_AREA_STATUS_PRESENTATION} />
              </div>
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Checkpoints de sincronização</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 pt-0 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Pedidos: </span>
            {timeAgo(status.checkpoints?.ordersSyncAt)}
          </div>
          <div>
            <span className="text-muted-foreground">Produtos: </span>
            {timeAgo(status.checkpoints?.productsSyncAt)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
