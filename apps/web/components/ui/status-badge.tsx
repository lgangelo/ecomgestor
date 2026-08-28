import type { StatusPresentation } from '@ecommerce-manager/ui';
import { Badge } from './badge';

export function StatusBadge({
  status,
  map,
}: {
  status: string;
  map: Record<string, StatusPresentation>;
}) {
  const presentation = map[status] ?? { label: status, tone: 'default' as const };
  return <Badge tone={presentation.tone}>{presentation.label}</Badge>;
}
