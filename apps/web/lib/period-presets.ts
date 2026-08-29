/** Presets de período reutilizáveis (seção 59 da Fase 4) — mesmo componente usado em telas com
 * filtro de data (por ora, Dashboard; Pedidos/Financeiro/Fiscal/Relatórios reaproveitam esta
 * mesma função quando ganharem seletor de período). */
export type PeriodPreset = 'today' | 'last7' | 'last30' | 'this_month' | 'last_month' | 'custom';

export const PERIOD_PRESET_OPTIONS: Array<{ value: PeriodPreset; label: string }> = [
  { value: 'today', label: 'Hoje' },
  { value: 'last7', label: 'Últimos 7 dias' },
  { value: 'last30', label: 'Últimos 30 dias' },
  { value: 'this_month', label: 'Este mês' },
  { value: 'last_month', label: 'Mês anterior' },
  { value: 'custom', label: 'Personalizado' },
];

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Retorna `null` para "custom" — o chamador mantém as datas atuais nesse caso. */
export function computePeriodPreset(preset: PeriodPreset): { dateFrom: string; dateTo: string } | null {
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;

  switch (preset) {
    case 'today':
      return { dateFrom: toISODate(now), dateTo: toISODate(now) };
    case 'last7':
      return { dateFrom: toISODate(new Date(now.getTime() - 6 * dayMs)), dateTo: toISODate(now) };
    case 'last30':
      return { dateFrom: toISODate(new Date(now.getTime() - 29 * dayMs)), dateTo: toISODate(now) };
    case 'this_month':
      return { dateFrom: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), dateTo: toISODate(now) };
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { dateFrom: toISODate(start), dateTo: toISODate(end) };
    }
    case 'custom':
    default:
      return null;
  }
}
