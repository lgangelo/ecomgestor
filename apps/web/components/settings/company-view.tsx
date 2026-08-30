'use client';

import * as React from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useCompany, useUpdateCompany } from '@/hooks/use-company';
import { useRecalculateOrderCosts } from '@/hooks/use-orders';

const TIMEZONES = ['America/Sao_Paulo', 'America/Manaus', 'America/Rio_Branco', 'America/Noronha'];

export function CompanyView() {
  const { data: company, isLoading } = useCompany();
  const updateCompany = useUpdateCompany();
  const recalculateCosts = useRecalculateOrderCosts();

  const [form, setForm] = React.useState({
    name: '',
    legalName: '',
    cnpj: '',
    timezone: 'America/Sao_Paulo',
    currency: 'BRL',
    slowMovingDays: 60,
    restockCoverageDays: 14,
    inventoryAutoSyncEnabled: false,
  });

  React.useEffect(() => {
    if (company) {
      setForm({
        name: company.name,
        legalName: company.legalName ?? '',
        cnpj: company.cnpj ?? '',
        timezone: company.timezone,
        currency: company.currency,
        slowMovingDays: company.slowMovingDays,
        restockCoverageDays: company.restockCoverageDays,
        inventoryAutoSyncEnabled: company.inventoryAutoSyncEnabled,
      });
    }
  }, [company]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await updateCompany.mutateAsync({
      name: form.name,
      legalName: form.legalName || undefined,
      cnpj: form.cnpj || undefined,
      timezone: form.timezone,
      currency: form.currency,
      slowMovingDays: form.slowMovingDays,
      restockCoverageDays: form.restockCoverageDays,
    });
  }

  function handleToggleAutoSync(checked: boolean) {
    setForm((f) => ({ ...f, inventoryAutoSyncEnabled: checked }));
    updateCompany.mutate({ inventoryAutoSyncEnabled: checked });
  }

  if (isLoading || !company) return <Skeleton className="h-96" />;

  return (
    <div>
      <PageHeader title="Empresa" description="Dados cadastrais e configurações gerenciais da empresa." />
      <Card className="mb-6">
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome fantasia</Label>
              <Input id="name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="legalName">Razão social</Label>
              <Input
                id="legalName"
                value={form.legalName}
                onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input id="cnpj" value={form.cnpj} onChange={(e) => setForm((f) => ({ ...f, cnpj: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Fuso horário</Label>
              <Select value={form.timezone} onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currency">Moeda</Label>
              <Input
                id="currency"
                maxLength={8}
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slowMovingDays">Dias para estoque parado</Label>
              <Input
                id="slowMovingDays"
                type="number"
                min={1}
                max={365}
                value={form.slowMovingDays}
                onChange={(e) => setForm((f) => ({ ...f, slowMovingDays: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="restockCoverageDays">Limite de cobertura para reposição (dias)</Label>
              <Input
                id="restockCoverageDays"
                type="number"
                min={1}
                max={365}
                value={form.restockCoverageDays}
                onChange={(e) => setForm((f) => ({ ...f, restockCoverageDays: Number(e.target.value) }))}
              />
            </div>
            <div className="col-span-full flex justify-end">
              <Button type="submit" disabled={updateCompany.isPending}>
                {updateCompany.isPending ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sincronização automática de estoque</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="flex items-center gap-3">
            <Switch checked={form.inventoryAutoSyncEnabled} onCheckedChange={handleToggleAutoSync} />
            <span className="text-sm font-medium">{form.inventoryAutoSyncEnabled ? 'Ativada' : 'Desativada'}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Quando ativado, alterações no estoque central serão enviadas automaticamente para a TikTok Shop. Depende
            também da configuração do servidor (<code>TIKTOK_INVENTORY_PUSH_ENABLED</code>) — com qualquer um dos
            dois desligado, a sincronização continua manual.
          </p>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recalcular custo dos pedidos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <p className="text-xs text-muted-foreground">
            Atualiza o custo (CMV) de todos os itens de pedido já importados usando o custo mais recente
            cadastrado agora em cada variação — útil quando o custo só foi registrado depois de produtos/pedidos
            já terem sido importados. Nunca altera o total ou o desconto do pedido, só o custo unitário.
          </p>
          <Button
            variant="outline"
            disabled={recalculateCosts.isPending}
            onClick={() => recalculateCosts.mutate()}
          >
            {recalculateCosts.isPending ? 'Recalculando...' : 'Recalcular custos agora'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
