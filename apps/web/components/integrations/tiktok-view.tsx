'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTikTokStatus } from '@/hooks/use-tiktok';
import { TikTokOverviewTab } from './tiktok/tiktok-overview-tab';
import { TikTokProductsTab } from './tiktok/tiktok-products-tab';
import { TikTokOrdersTab } from './tiktok/tiktok-orders-tab';
import { TikTokInventoryTab } from './tiktok/tiktok-inventory-tab';
import { TikTokFinanceTab } from './tiktok/tiktok-finance-tab';
import { TikTokFiscalTab } from './tiktok/tiktok-fiscal-tab';
import { TikTokFailuresTab } from './tiktok/tiktok-failures-tab';
import { TikTokSettingsTab } from './tiktok/tiktok-settings-tab';

export function TikTokIntegrationView() {
  const { data: status, isLoading } = useTikTokStatus();

  return (
    <div>
      <Link
        href="/integracoes"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para integrações
      </Link>

      <PageHeader title="TikTok Shop" description="Integração real via OAuth — pedidos, produtos, estoque, financeiro e devoluções." />

      {isLoading || !status ? (
        <Skeleton className="h-96" />
      ) : !status.configured ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <p className="text-sm font-medium">TikTok Shop não configurado</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure <code>TIKTOK_APP_KEY</code> e <code>TIKTOK_APP_SECRET</code> para conectar sua loja.
          </p>
        </div>
      ) : (
        <Tabs defaultValue="visao-geral">
          <TabsList className="flex-wrap">
            <TabsTrigger value="visao-geral">Visão geral</TabsTrigger>
            <TabsTrigger value="produtos">Produtos</TabsTrigger>
            <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
            <TabsTrigger value="estoque">Estoque</TabsTrigger>
            <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
            <TabsTrigger value="fiscal">Fiscal</TabsTrigger>
            <TabsTrigger value="falhas">Falhas</TabsTrigger>
            <TabsTrigger value="configuracoes">Configurações</TabsTrigger>
          </TabsList>
          <TabsContent value="visao-geral">
            <TikTokOverviewTab status={status} />
          </TabsContent>
          <TabsContent value="produtos">
            <TikTokProductsTab />
          </TabsContent>
          <TabsContent value="pedidos">
            <TikTokOrdersTab channelId={status.channelId} />
          </TabsContent>
          <TabsContent value="estoque">
            <TikTokInventoryTab status={status} />
          </TabsContent>
          <TabsContent value="financeiro">
            <TikTokFinanceTab status={status} />
          </TabsContent>
          <TabsContent value="fiscal">
            <TikTokFiscalTab />
          </TabsContent>
          <TabsContent value="falhas">
            <TikTokFailuresTab />
          </TabsContent>
          <TabsContent value="configuracoes">
            <TikTokSettingsTab status={status} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
