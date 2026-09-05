import { StockEntryDetailView } from '@/components/inventory/stock-entry-detail-view';

export default async function EntradaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StockEntryDetailView id={id} />;
}
