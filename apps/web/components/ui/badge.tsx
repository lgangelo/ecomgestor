import * as React from 'react';
import { cn } from '@/lib/utils';
import type { BadgeTone } from '@ecommerce-manager/ui';

const TONE_CLASSES: Record<BadgeTone, string> = {
  default: 'bg-secondary text-secondary-foreground',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-destructive/15 text-destructive',
  info: 'bg-primary/15 text-primary',
  muted: 'bg-muted text-muted-foreground',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ className, tone = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    />
  );
}
