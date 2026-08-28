/**
 * Utilitários de valores monetários. A aplicação nunca usa `number`/float para dinheiro:
 * no banco os campos são NUMERIC(14,2); na API/DB client eles chegam como string (Prisma Decimal
 * serializado) e só são convertidos para exibição usando Intl.NumberFormat.
 */

export function formatBRL(value: string | number): string {
  const numeric = typeof value === 'string' ? Number(value) : value;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(numeric);
}

/** Soma valores monetários representados como strings decimais, preservando precisão de centavos. */
export function sumDecimalStrings(values: Array<string | number>): string {
  const totalCents = values.reduce<number>((acc, v) => acc + toCents(v), 0);
  return fromCents(totalCents);
}

function toCents(value: string | number): number {
  const numeric = typeof value === 'string' ? Number(value) : value;
  return Math.round(numeric * 100);
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}
