export function formatMoney(value: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

export function formatQty(value: number): string {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function localIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayIso(): string {
  return localIso(new Date());
}

export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - (days - 1));
  return localIso(d);
}
