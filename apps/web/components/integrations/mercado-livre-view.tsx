'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMercadoLivreStatus } from '@/hooks/use-mercado-livre';
import { MercadoLivreOverviewTab } from './mercado-livre/mercado-livre-overview-tab';
import { MercadoLivreSettingsTab } from './mercado-livre/mercado-livre-settings-tab';
import { MercadoLivreInventoryTab } from './mercado-livre/mercado-livre-inventory-tab';
import { MercadoLivreFailuresTab } from './mercado-livre/mercado-livre-failures-tab';

/**
 * Integração Mercado Livre — sincronização automática de pedidos (Bloco 1), estoque (Bloco 2) e
 * publicação/atualização de produtos (Bloco 3) já implementadas, seguindo o mesmo padrão de
 * `tiktok-view.tsx`.
 */
export function MercadoLivreIntegrationView() {
  const { data: status, isLoading } = useMercadoLivreStatus();

  return (
    <div>
      <Link
        href="/integracoes"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para integrações
      </Link>

      <PageHeader title="Mercado Livre" description="Integração via OAuth — pedidos e estoque sincronizados automaticamente." />

      {isLoading || !status ? (
        <Skeleton className="h-96" />
      ) : !status.configured ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <p className="text-sm font-medium">Mercado Livre não configurado</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure <code>MERCADOLIVRE_CLIENT_ID</code> e <code>MERCADOLIVRE_CLIENT_SECRET</code> para conectar sua
            conta.
          </p>
        </div>
      ) : (
        <Tabs defaultValue="visao-geral">
          <TabsList className="flex-wrap">
            <TabsTrigger value="visao-geral">Visão geral</TabsTrigger>
            <TabsTrigger value="configuracoes">Configurações</TabsTrigger>
            <TabsTrigger value="estoque">Estoque</TabsTrigger>
            <TabsTrigger value="falhas">Falhas</TabsTrigger>
          </TabsList>
          <TabsContent value="visao-geral">
            <MercadoLivreOverviewTab status={status} />
          </TabsContent>
          <TabsContent value="configuracoes">
            <MercadoLivreSettingsTab status={status} />
          </TabsContent>
          <TabsContent value="estoque">
            <MercadoLivreInventoryTab status={status} />
          </TabsContent>
          <TabsContent value="falhas">
            <MercadoLivreFailuresTab />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
