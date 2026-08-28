import { Card, CardContent } from '@/components/ui/card';
import { formatBRL } from '@ecommerce-manager/shared';
import { cn } from '@/lib/utils';
import type { FinanceOverview } from '@/hooks/use-finance';

function Row({
  label,
  value,
  isTotal,
  isNegative,
}: {
  label: string;
  value: number;
  isTotal?: boolean;
  isNegative?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between py-2',
        isTotal && 'border-t border-border pt-3 font-semibold',
      )}
    >
      <span className={cn('text-sm', isTotal ? 'text-foreground' : 'text-muted-foreground')}>{label}</span>
      <span className={cn('text-sm font-medium', isNegative && 'text-destructive', isTotal && 'text-base')}>
        {isNegative ? '- ' : ''}
        {formatBRL(Math.abs(value))}
      </span>
    </div>
  );
}

export function DreBreakdown({ data }: { data: FinanceOverview }) {
  return (
    <Card>
      <CardContent className="p-6">
        <Row label="Receita bruta" value={data.grossRevenue} />
        <Row label="(-) Descontos" value={data.discounts} isNegative />
        <Row label="(-) Devoluções" value={data.returnsAmount} isNegative />
        <Row label="= Receita líquida" value={data.netRevenue} isTotal />

        <Row label="(-) CMV" value={data.cmv} isNegative />
        <Row label="= Lucro bruto" value={data.grossProfit} isTotal />

        <Row label="(-) Taxas" value={data.fees} isNegative />
        <Row label="(-) Marketing" value={data.marketing} isNegative />
        <Row label="(-) Embalagem" value={data.packaging} isNegative />
        <Row label="(-) Despesas" value={data.otherExpenses} isNegative />
        <Row label="(-) Impostos estimados" value={data.estimatedTaxes} isNegative />
        <Row label="= Resultado gerencial" value={data.managementResult} isTotal />

        <p className="mt-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{data.disclaimer}</p>
      </CardContent>
    </Card>
  );
}
