/**
 * Working-day maths on ISO date strings ('YYYY-MM-DD').
 * Servers run in UTC, so dates are kept as plain strings and "today" is taken in Asia/Kuala_Lumpur.
 * Weekend = Saturday & Sunday (Penang). Holidays = Set of ISO dates.
 */

export type ISODate = string;

function toUTC(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUTC(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function isWorkday(iso: ISODate, holidays: Set<string>): boolean {
  const w = toUTC(iso).getUTCDay();
  return w !== 0 && w !== 6 && !holidays.has(iso);
}

/** Move n working days forward (n > 0) or backward (n < 0). */
export function addWorkdays(iso: ISODate, n: number, holidays: Set<string>): ISODate {
  const d = toUTC(iso);
  const step = n < 0 ? -1 : 1;
  let left = Math.abs(n);
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + step);
    if (isWorkday(fromUTC(d), holidays)) left--;
  }
  return fromUTC(d);
}

/** Working days from a (exclusive) to b (inclusive). Negative when b is before a. */
export function workdaysBetween(a: ISODate, b: ISODate, holidays: Set<string>): number {
  if (a === b) return 0;
  const sign = b > a ? 1 : -1;
  const d = toUTC(a);
  let count = 0;
  while (fromUTC(d) !== b) {
    d.setUTCDate(d.getUTCDate() + sign);
    if (isWorkday(fromUTC(d), holidays)) count++;
  }
  return sign * count;
}

export function todayMY(now: Date = new Date()): ISODate {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** 'YYYY-MM-DD' → 'dd/mm/yyyy' */
export function fmt(iso: ISODate | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Accepts dd/mm/yyyy, yyyy-mm-dd or an Excel serial number. Returns ISO or null. */
export function parseDateInput(v: unknown): ISODate | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  let r: RegExpMatchArray | null;
  if (/^\d{5}$/.test(s)) {
    return fromUTC(new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000));
  } else if ((r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) {
    [y, m, d] = [+r[1], +r[2], +r[3]];
  } else if ((r = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/))) {
    [d, m, y] = [+r[1], +r[2], +r[3] < 100 ? 2000 + +r[3] : +r[3]];
  } else {
    return null;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return fromUTC(dt);
}
