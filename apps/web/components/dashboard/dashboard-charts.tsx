'use client';

import * as React from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { formatBRL } from '@ecommerce-manager/shared';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DashboardResponse } from '@/hooks/use-reports';

const PIE_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--destructive))',
  'hsl(var(--muted-foreground))',
];

const chartTooltipStyle = {
  backgroundColor: 'hsl(var(--popover))',
  color: 'hsl(var(--popover-foreground))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
};

/** Formata a label do eixo X — funciona tanto para "YYYY-MM-DD" (dia) quanto "YYYY-Www" (semana
 * ISO, usada pelo backend quando o período selecionado é longo — seção 30 da Fase 4). */
function formatBucketLabel(value: string): string {
  const weekMatch = /^(\d{4})-W(\d{2})$/.exec(value);
  if (weekMatch) return `Sem ${weekMatch[2]}`;
  return formatDate(value);
}

/** Gráfico principal do dashboard (seção 30): faturamento x resultado em um único gráfico, para
 * não fragmentar em vários cards separados (seção 62 — evitar excesso de gráficos). */
export function RevenueByPeriodChart({ data }: { data: DashboardResponse['charts']['revenueByPeriod'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Faturamento x Resultado</CardTitle>
      </CardHeader>
      <CardContent className="h-72 pt-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              tickFormatter={formatBucketLabel}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={70} tickFormatter={(v) => formatBRL(v)} />
            <Tooltip
              contentStyle={chartTooltipStyle}
              labelFormatter={(v) => formatBucketLabel(v as string)}
              formatter={(v: number, name: string) => [formatBRL(v), name === 'total' ? 'Faturamento' : 'Resultado']}
            />
            <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" fill="url(#revenueFill)" strokeWidth={2} />
            <Line type="monotone" dataKey="result" stroke="hsl(var(--success))" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function SalesByDayChart({ data }: { data: DashboardResponse['charts']['salesByDay'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vendas por dia</CardTitle>
      </CardHeader>
      <CardContent className="h-72 pt-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tickFormatter={(v) => formatDate(v)} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={30} />
            <Tooltip contentStyle={chartTooltipStyle} labelFormatter={(v) => formatDate(v as string)} />
            <Bar dataKey="orders" name="Pedidos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

/** Vendas por canal (seção 31 da Fase 4): % visual (pizza) + detalhe por canal (ticket médio,
 * lucro, margem) — não só faturamento. */
export function SalesByChannelChart({ data }: { data: DashboardResponse['charts']['salesByChannel'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vendas por canal</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {data.length === 0 ? (
          <p className="flex h-40 items-center justify-center text-sm text-muted-foreground">Sem dados no período.</p>
        ) : (
          <>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} dataKey="total" nameKey="channelName" innerRadius={50} outerRadius={90} paddingAngle={2}>
                    {data.map((entry, index) => (
                      <Cell key={entry.channelName} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatBRL(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Canal</TableHead>
                  <TableHead>%</TableHead>
                  <TableHead>Faturamento</TableHead>
                  <TableHead>Pedidos</TableHead>
                  <TableHead>Ticket médio</TableHead>
                  <TableHead>Lucro</TableHead>
                  <TableHead>Margem (venda)</TableHead>
                  <TableHead>Markup (custo)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={row.channelName}>
                    <TableCell className="font-medium">{row.channelName}</TableCell>
                    <TableCell>{row.share.toFixed(0)}%</TableCell>
                    <TableCell>{formatBRL(row.total)}</TableCell>
                    <TableCell>{row.orders}</TableCell>
                    <TableCell>{formatBRL(row.averageTicket)}</TableCell>
                    <TableCell>{formatBRL(row.profit)}</TableCell>
                    <TableCell className={row.marginPercent >= 0 ? 'text-success' : 'text-destructive'}>
                      {row.marginPercent.toFixed(1)}%
                    </TableCell>
                    <TableCell className={row.markupPercent !== null && row.markupPercent < 0 ? 'text-destructive' : ''}>
                      {row.markupPercent === null ? '—' : `${row.markupPercent.toFixed(1)}%`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}

type ProductSortMode = 'revenue' | 'profit' | 'margin';

const PRODUCT_SORT_OPTIONS: Array<{ value: ProductSortMode; label: string }> = [
  { value: 'revenue', label: 'Mais vendidos' },
  { value: 'profit', label: 'Maior lucro' },
  { value: 'margin', label: 'Menor margem' },
];

/** Ranking unificado de produtos (seção 32 da Fase 4) com alternância entre critérios — troca só
 * a ordenação no cliente, sem nova requisição. */
export function ProductsRankingTable({ data }: { data: DashboardResponse['charts']['products'] }) {
  const [sortMode, setSortMode] = React.useState<ProductSortMode>('revenue');

  const sorted = React.useMemo(() => {
    const copy = [...data];
    if (sortMode === 'profit') return copy.sort((a, b) => b.profit - a.profit);
    if (sortMode === 'margin') return copy.sort((a, b) => a.marginPercent - b.marginPercent);
    return copy.sort((a, b) => b.revenue - a.revenue);
  }, [data, sortMode]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Produtos</CardTitle>
        <div className="flex gap-1">
          {PRODUCT_SORT_OPTIONS.map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={sortMode === option.value ? 'default' : 'outline'}
              className="h-7 px-2 text-xs"
              onClick={() => setSortMode(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {sorted.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sem vendas no período.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Unidades</TableHead>
                <TableHead>Faturamento</TableHead>
                <TableHead>Lucro</TableHead>
                <TableHead>Margem (venda)</TableHead>
                <TableHead>Markup (custo)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.slice(0, 10).map((item) => (
                <TableRow key={item.productName}>
                  <TableCell className="max-w-56 truncate font-medium">{item.productName}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{formatBRL(item.revenue)}</TableCell>
                  <TableCell>{formatBRL(item.profit)}</TableCell>
                  <TableCell className={cn(item.marginPercent >= 0 ? 'text-success' : 'text-destructive')}>
                    {item.marginPercent.toFixed(1)}%
                  </TableCell>
                  <TableCell className={cn(item.markupPercent !== null && item.markupPercent < 0 ? 'text-destructive' : '')}>
                    {item.markupPercent === null ? '—' : `${item.markupPercent.toFixed(1)}%`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function TopProductsTable({ data }: { data: DashboardResponse['charts']['topProducts'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Produtos mais vendidos</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sem vendas no período.</p>
        ) : (
          <div className="space-y-3">
            {data.map((item, index) => (
              <div key={item.productName} className="flex items-center gap-3">
                <span className="w-5 shrink-0 text-xs font-medium text-muted-foreground">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.productName}</p>
                  <p className="text-xs text-muted-foreground">{item.quantity} unidades</p>
                </div>
                <span className="shrink-0 text-sm font-medium">{formatBRL(item.revenue)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MarginByProductTable({ data }: { data: DashboardResponse['charts']['marginByProduct'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Margem por produto</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sem vendas no período.</p>
        ) : (
          <div className="space-y-3">
            {data.map((item) => (
              <div key={item.productName} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.productName}</p>
                </div>
                <span
                  className={
                    item.marginPercent >= 0
                      ? 'shrink-0 text-sm font-medium text-success'
                      : 'shrink-0 text-sm font-medium text-destructive'
                  }
                >
                  {item.marginPercent.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
