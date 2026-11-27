import { ValidationError } from './errors';

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function parseDateInput(value: string): Date {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!dateOnly) return new Date(value);

  const year = Number(dateOnly[1]);
  const month = Number(dateOnly[2]);
  const day = Number(dateOnly[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return new Date(Number.NaN);
  }
  return date;
}

export function parseDashboardRange(from?: string, to?: string, defaultDays = 30) {
  const now = new Date();
  const end = to ? endOfDay(parseDateInput(to)) : endOfDay(now);
  const start = from
    ? startOfDay(parseDateInput(from))
    : startOfDay(new Date(end.getTime() - (defaultDays - 1) * 24 * 60 * 60 * 1000));

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new ValidationError('Invalid date range.');
  }
  if (start > end) {
    throw new ValidationError('from must be on or before to.');
  }

  return { from: start, to: end };
}

export function isoDay(date: Date | string): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isFutureTransactionDate(value: string, now = new Date()): boolean {
  const date = parseDateInput(value);
  if (Number.isNaN(date.getTime())) return true;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return isoDay(date) > isoDay(now);
  }

  return date.getTime() > now.getTime() + 5 * 60 * 1000;
}

export function eachDayInclusive(from: Date, to: Date): string[] {
  const days: string[] = [];
  const cursor = startOfDay(from);
  const last = startOfDay(to);
  while (cursor <= last) {
    days.push(isoDay(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}
