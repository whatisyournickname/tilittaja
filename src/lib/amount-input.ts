export function formatAmountInputValue(amount: number): string {
  return amount.toFixed(2).replace('.', ',');
}

export function parseAmountInputValue(value: string): number | null {
  const normalized = value.trim().replace(/\s+/g, '').replace(',', '.');
  if (!normalized) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;

  return Math.round(amount * 100) / 100;
}

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function normalizeAmountSearchValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s\u00a0]/g, '')
    .replace(/[€$]|HKD/gi, '')
    .replace(/\.(?=\d{3}(?:[.,]|$))/g, '')
    .replace(',', '.');
}
