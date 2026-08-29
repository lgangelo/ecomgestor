'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface OnboardingStep {
  key: string;
  label: string;
  completed: boolean;
  href: string;
}

export interface OnboardingStatus {
  steps: OnboardingStep[];
  completedCount: number;
  totalCount: number;
}

export function useOnboardingStatus() {
  return useQuery({
    queryKey: ['onboarding-status'],
    queryFn: () => apiFetch<OnboardingStatus>('/onboarding/status'),
  });
}
