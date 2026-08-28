import { StockEntryDetailView } from '@/components/inventory/stock-entry-detail-view';

export default function EntradaDetailPage({ params }: { params: { id: string } }) {
  return <StockEntryDetailView id={params.id} />;
}
