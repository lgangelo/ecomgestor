/**
 * Escapa um valor para uma linha CSV (delimitador `;`, como o resto do app já usa) e neutraliza
 * CSV/formula injection (seção 72 da Fase 4): um valor começando com `=`, `+`, `-` ou `@` seria
 * interpretado como fórmula por Excel/LibreOffice ao abrir o arquivo — prefixamos com um apóstrofo
 * (convenção padrão para forçar interpretação como texto) antes de aplicar o escape normal de
 * aspas/delimitador.
 */
const FORMULA_PREFIX_PATTERN = /^[=+\-@]/;

export function csvEscape(value: string): string {
  const safe = FORMULA_PREFIX_PATTERN.test(value) ? `'${value}` : value;
  if (/["\n;]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

export function buildCsvRow(values: unknown[]): string {
  return values.map((v) => csvEscape(String(v ?? ''))).join(';');
}
