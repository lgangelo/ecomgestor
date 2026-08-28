'use client';

import Link from 'next/link';
import { Plug } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { INTEGRATION_STATUS_PRESENTATION } from '@ecommerce-manager/ui';
import { useIntegrations } from '@/hooks/use-integrations';

const LABELS: Record<string, { name: string; href: string }> = {
  TIKTOK_SHOP: { name: 'TikTok Shop', href: '/integracoes/tiktok' },
  SHOPEE: { name: 'Shopee', href: '/integracoes/shopee' },
  MERCADO_LIVRE: { name: 'Mercado Livre', href: '/integracoes/mercado-livre' },
};

export function IntegrationsView() {
  const { data, isLoading } = useIntegrations();

  return (
    <div>
      <PageHeader title="Integrações" description="Conecte seus canais de marketplace." />

      {isLoading || !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {data.map((integration) => {
            const meta = LABELS[integration.provider];
            const disabled = integration.status === 'COMING_SOON';
            return (
              <Link key={integration.provider} href={meta.href} className={disabled ? 'pointer-events-none' : ''}>
                <Card className={disabled ? 'opacity-60' : 'transition-shadow hover:shadow-md'}>
                  <CardHeader className="flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base font-semibold text-foreground">{meta.name}</CardTitle>
                    <Plug className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent className="pt-0">
                    <StatusBadge status={integration.status} map={INTEGRATION_STATUS_PRESENTATION} />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
