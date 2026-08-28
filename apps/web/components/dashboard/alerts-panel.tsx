import { AlertTriangle, FileWarning, PackageX, PlugZap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DashboardResponse } from '@/hooks/use-reports';

export function AlertsPanel({ alerts }: { alerts: DashboardResponse['alerts'] }) {
  const rows = [
    {
      icon: PackageX,
      label: 'Produtos abaixo do estoque mínimo',
      value: alerts.belowMinimumStock.length,
      tone: alerts.belowMinimumStock.length > 0 ? 'text-warning' : 'text-muted-foreground',
    },
    {
      icon: AlertTriangle,
      label: 'Pedidos cancelados no período',
      value: alerts.cancelledOrders,
      tone: alerts.cancelledOrders > 0 ? 'text-destructive' : 'text-muted-foreground',
    },
    {
      icon: FileWarning,
      label: 'Vendas sem NF-e',
      value: alerts.salesWithoutFiscalDocument,
      tone: alerts.salesWithoutFiscalDocument > 0 ? 'text-warning' : 'text-muted-foreground',
    },
    {
      icon: PlugZap,
      label: 'Integração atrasada',
      value: alerts.integrationDelayed ? 'Sim' : 'Não',
      tone: alerts.integrationDelayed ? 'text-destructive' : 'text-muted-foreground',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alertas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-foreground">
              <row.icon className={`h-4 w-4 ${row.tone}`} />
              {row.label}
            </span>
            <span className={`font-semibold ${row.tone}`}>{row.value}</span>
          </div>
        ))}
        {alerts.belowMinimumStock.length > 0 && (
          <div className="mt-2 space-y-1 border-t border-border pt-3">
            {alerts.belowMinimumStock.slice(0, 5).map((item) => (
              <p key={item.sku} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{item.productName}</span> ({item.sku}) — {item.available}{' '}
                disponível(is), mínimo {item.minStock}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
