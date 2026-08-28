'use client';

import { Radio } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useChannels } from '@/hooks/use-channels';

export function ChannelsView() {
  const { data, isLoading } = useChannels();

  return (
    <div>
      <PageHeader title="Canais" description="Canais de venda cadastrados (marketplaces e manuais)." />

      {isLoading || !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon={Radio} title="Nenhum canal cadastrado" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((channel) => (
            <Card key={channel.id}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base font-semibold text-foreground">{channel.name}</CardTitle>
                <Badge tone={channel.isActive ? 'success' : 'muted'}>
                  {channel.isActive ? 'Ativo' : 'Inativo'}
                </Badge>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-muted-foreground">
                {channel.isManual ? 'Canal manual' : 'Marketplace'}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
