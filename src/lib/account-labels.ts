import { ACCOUNT_TYPES } from '@/lib/types';

export function getAccountTypeLabel(type: number): string {
  return ACCOUNT_TYPES[type as keyof typeof ACCOUNT_TYPES] ?? 'Other';
}
