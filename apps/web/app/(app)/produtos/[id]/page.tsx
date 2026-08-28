import { ProductDetailView } from '@/components/products/product-detail-view';

export default function ProdutoDetailPage({ params }: { params: { id: string } }) {
  return <ProductDetailView productId={params.id} />;
}
