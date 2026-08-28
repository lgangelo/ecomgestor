import { OrderStatus } from '@ecommerce-manager/database';
import { assertValidTransition, isPreShipmentStatus } from './order-state-machine';

describe('order state machine', () => {
  it('allows the documented happy path', () => {
    const path = [
      OrderStatus.CREATED,
      OrderStatus.PAID,
      OrderStatus.PROCESSING,
      OrderStatus.READY_TO_SHIP,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(() => assertValidTransition(path[i], path[i + 1])).not.toThrow();
    }
  });

  it('rejects skipping stages', () => {
    expect(() => assertValidTransition(OrderStatus.CREATED, OrderStatus.SHIPPED)).toThrow();
    expect(() => assertValidTransition(OrderStatus.PAID, OrderStatus.DELIVERED)).toThrow();
  });

  it('rejects any transition out of a terminal status', () => {
    expect(() => assertValidTransition(OrderStatus.CANCELLED, OrderStatus.PAID)).toThrow();
    expect(() => assertValidTransition(OrderStatus.REFUNDED, OrderStatus.CREATED)).toThrow();
  });

  it('allows cancellation from every pre-shipment status', () => {
    for (const status of [OrderStatus.CREATED, OrderStatus.PAID, OrderStatus.PROCESSING, OrderStatus.READY_TO_SHIP]) {
      expect(() => assertValidTransition(status, OrderStatus.CANCELLED)).not.toThrow();
    }
  });

  it('allows the return/refund path', () => {
    expect(() => assertValidTransition(OrderStatus.DELIVERED, OrderStatus.RETURN_REQUESTED)).not.toThrow();
    expect(() => assertValidTransition(OrderStatus.RETURN_REQUESTED, OrderStatus.RETURNED)).not.toThrow();
    expect(() => assertValidTransition(OrderStatus.RETURNED, OrderStatus.REFUNDED)).not.toThrow();
    expect(() => assertValidTransition(OrderStatus.RETURNED, OrderStatus.PARTIALLY_REFUNDED)).not.toThrow();
    expect(() => assertValidTransition(OrderStatus.PARTIALLY_REFUNDED, OrderStatus.REFUNDED)).not.toThrow();
  });

  it('treats a same-status transition as a no-op', () => {
    expect(() => assertValidTransition(OrderStatus.PAID, OrderStatus.PAID)).not.toThrow();
  });

  it('classifies pre-shipment statuses correctly for reservation purposes', () => {
    expect(isPreShipmentStatus(OrderStatus.CREATED)).toBe(true);
    expect(isPreShipmentStatus(OrderStatus.READY_TO_SHIP)).toBe(true);
    expect(isPreShipmentStatus(OrderStatus.SHIPPED)).toBe(false);
    expect(isPreShipmentStatus(OrderStatus.DELIVERED)).toBe(false);
    expect(isPreShipmentStatus(OrderStatus.CANCELLED)).toBe(false);
  });
});
