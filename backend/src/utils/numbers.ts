export function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    const n = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function roundQty(value: number): number {
  return Number(value.toFixed(3));
}

export function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}
