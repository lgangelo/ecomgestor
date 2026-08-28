/**
 * Utilitário compartilhado de intervalo mensal (UTC), usado pelo fechamento financeiro e pela
 * exportação fiscal por mês (Fase 4). Movido para `common/` porque agora dois módulos
 * independentes (finance e fiscal) precisam do mesmo cálculo — nenhum dos dois deve depender
 * do outro só por causa disso.
 */
export function getCurrentMonthRange(reference = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { start, end };
}

/** Converte 'YYYY-MM' no intervalo [primeiro dia do mês, primeiro dia do mês seguinte) em UTC. */
export function getMonthRangeFromReference(referenceMonth: string): { start: Date; end: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(referenceMonth);
  if (!match) {
    throw new Error(`referenceMonth inválido: ${referenceMonth}. Formato esperado: YYYY-MM`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { start, end };
}
