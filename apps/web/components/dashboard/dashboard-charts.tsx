'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBRL } from '@ecommerce-manager/shared';
import { formatDate } from '@/lib/format';
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

export function RevenueByPeriodChart({ data }: { data: DashboardResponse['charts']['revenueByPeriod'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Faturamento por período</CardTitle>
      </CardHeader>
      <CardContent className="h-72 pt-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              tickFormatter={(v) => formatDate(v)}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={70} tickFormatter={(v) => formatBRL(v)} />
            <Tooltip
              contentStyle={chartTooltipStyle}
              labelFormatter={(v) => formatDate(v as string)}
              formatter={(v: number) => [formatBRL(v), 'Faturamento']}
            />
            <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" fill="url(#revenueFill)" strokeWidth={2} />
          </AreaChart>
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

export function SalesByChannelChart({ data }: { data: DashboardResponse['charts']['salesByChannel'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vendas por canal</CardTitle>
      </CardHeader>
      <CardContent className="h-72 pt-0">
        {data.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem dados no período.</p>
        ) : (
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
