/**
 * Utilitário compartilhado para o limite superior de um filtro "Até <data>" (De/Até em qualquer
 * tela). CONFIRMADO em produção: `lte: new Date(dateTo)` (usado em pelo menos 8 lugares
 * diferentes — auditoria, documentos fiscais, despesas, taxas, dashboard, jobs, pedidos,
 * movimentações de estoque) exclui silenciosamente tudo que aconteceu DEPOIS da meia-noite do
 * próprio dia "Até", porque uma data sem hora (`"2026-08-30"`) sempre vira `00:00:00.000Z` — um
 * registro criado às 16h56 do mesmo dia já é "depois" desse instante e fica de fora. Este
 * utilitário devolve o início do dia SEGUINTE, para uso com `lt` (nunca `lte` com a data crua),
 * cobrindo o dia "Até" inteiro.
 */
export function endOfDayExclusive(dateStr: string): Date {
  const date = new Date(dateStr);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}
