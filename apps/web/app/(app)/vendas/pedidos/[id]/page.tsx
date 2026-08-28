import { OrderDetailView } from '@/components/orders/order-detail-view';

export default function PedidoDetailPage({ params }: { params: { id: string } }) {
  return <OrderDetailView orderId={params.id} />;
}
