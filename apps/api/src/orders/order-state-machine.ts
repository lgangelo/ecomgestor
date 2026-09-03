import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@ecommerce-manager/database';

/**
 * Única fonte de verdade para transições de status de pedido (seção 14). Tanto a
 * atualização manual de status quanto os fluxos de devolução/reembolso passam por aqui —
 * nenhum outro lugar do código decide se uma transição é válida.
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.CREATED]: [OrderStatus.PAID, OrderStatus.CANCELLED],
  [OrderStatus.PAID]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]: [OrderStatus.READY_TO_SHIP, OrderStatus.CANCELLED],
  [OrderStatus.READY_TO_SHIP]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.RETURN_REQUESTED, OrderStatus.CANCELLED],
  [OrderStatus.DELIVERED]: [OrderStatus.RETURN_REQUESTED],
  [OrderStatus.CANCELLED]: [],
  // REFUNDED/PARTIALLY_REFUNDED direto a partir daqui (além de via RETURNED) porque o fluxo real
  // de reembolso (`ReturnsService.createRefund`) nunca passa por um passo separado "mercadoria
  // recebida de volta" antes de reembolsar — `RETURNED` existe no modelo mas nenhum código hoje
  // o define. Widened aqui pra bater com o uso real, não pra remover a validação (que antes era
  // nenhuma: `createRefund` forçava o status sem checar nada, permitindo reembolso num pedido que
  // nem tinha sido enviado ainda).
  [OrderStatus.RETURN_REQUESTED]: [
    OrderStatus.RETURNED,
    OrderStatus.DELIVERED,
    OrderStatus.REFUNDED,
    OrderStatus.PARTIALLY_REFUNDED,
  ],
  [OrderStatus.RETURNED]: [OrderStatus.REFUNDED, OrderStatus.PARTIALLY_REFUNDED],
  [OrderStatus.REFUNDED]: [],
  [OrderStatus.PARTIALLY_REFUNDED]: [OrderStatus.REFUNDED],
};

/** Status em que o pedido ainda não teve baixa efetiva de estoque — apenas reserva. */
const PRE_SHIPMENT_STATUSES: OrderStatus[] = [
  OrderStatus.CREATED,
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.READY_TO_SHIP,
];

export function isPreShipmentStatus(status: OrderStatus): boolean {
  return PRE_SHIPMENT_STATUSES.includes(status);
}

export function assertValidTransition(from: OrderStatus, to: OrderStatus): void {
  if (from === to) return;
  const allowed = TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new BadRequestException(
      `Transição de status inválida: ${from} → ${to}. Transições permitidas a partir de ${from}: ${
        allowed.length ? allowed.join(', ') : 'nenhuma (status final)'
      }.`,
    );
  }
}
