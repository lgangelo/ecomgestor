'use client';

import Link from 'next/link';
import { ArrowLeft, Package, RefreshCw, ShoppingBag, Wallet, Warehouse } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { INTEGRATION_STATUS_PRESENTATION } from '@ecommerce-manager/ui';
import { formatDate } from '@/lib/format';
import { useIntegration, useIntegrationAction } from '@/hooks/use-integrations';

export function TikTokIntegrationView() {
  const { data, isLoading } = useIntegration('TIKTOK_SHOP');
  const action = useIntegrationAction('TIKTOK_SHOP');

  if (isLoading || !data) {
    return <Skeleton className="h-96" />;
  }

  const connected = data.status === 'CONNECTED';

  return (
    <div>
      <Link
        href="/integracoes"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para integrações
      </Link>

      <PageHeader
        title="TikTok Shop"
        description="Conecte sua loja para sincronizar pedidos, produtos, financeiro e estoque."
        actions={
          <div className="flex gap-2">
            {connected ? (
              <>
                <Button variant="outline" onClick={() => action.mutate('sync')} disabled={action.isPending}>
                  <RefreshCw className="h-4 w-4" />
                  Sincronizar agora
                </Button>
                <Button variant="outline" onClick={() => action.mutate('reconnect')} disabled={action.isPending}>
                  Reconectar
                </Button>
                <Button variant="destructive" onClick={() => action.mutate('disconnect')} disabled={action.isPending}>
                  Desconectar
                </Button>
              </>
            ) : (
              <Button onClick={() => action.mutate('connect')} disabled={action.isPending}>
                Conectar
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <StatusBadge status={data.status} map={INTEGRATION_STATUS_PRESENTATION} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Loja</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm font-medium">{data.storeName ?? 'Não conectada'}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Última sincronização</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm font-medium">
            {data.lastSyncAt ? formatDate(data.lastSyncAt, true) : 'Nunca sincronizado'}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Pedidos</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-0 text-2xl font-semibold">{data.ordersCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Produtos</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-0 text-2xl font-semibold">{data.productsMappedCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Financeiro</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-0 text-sm text-muted-foreground">Não implementado nesta etapa</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Estoque</CardTitle>
            <Warehouse className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-0 text-sm text-muted-foreground">Não implementado nesta etapa</CardContent>
        </Card>
      </div>
    </div>
  );
}
