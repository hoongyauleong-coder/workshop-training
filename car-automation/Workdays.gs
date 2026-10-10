/**
 * Working-day maths and date helpers.
 * Pure JavaScript (no Apps Script services) so it can be unit-tested outside Google.
 * Weekend = Saturday & Sunday (Penang). Holidays = a Set of 'yyyy-mm-dd' keys.
 */

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

function dateKey_(d) { return d.getFullYear() + '-' + pad2_(d.getMonth() + 1) + '-' + pad2_(d.getDate()); }

function startOfDay_(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

function formatDate_(d) { return d ? pad2_(d.getDate()) + '/' + pad2_(d.getMonth() + 1) + '/' + d.getFullYear() : ''; }

function isWorkday(d, holidays) {
  const w = d.getDay();
  if (w === 0 || w === 6) return false;
  return !(holidays && holidays.has(dateKey_(d)));
}

/** Move n working days forward (n > 0) or backward (n < 0) from d. */
function addWorkdays(d, n, holidays) {
  const r = startOfDay_(d);
  const step = n < 0 ? -1 : 1;
  let left = Math.abs(n);
  while (left > 0) {
    r.setDate(r.getDate() + step);
    if (isWorkday(r, holidays)) left--;
  }
  return r;
}

/** Working days from a (exclusive) to b (inclusive). Negative when b is before a. */
function workdaysBetween(a, b, holidays) {
  a = startOfDay_(a);
  b = startOfDay_(b);
  if (a.getTime() === b.getTime()) return 0;
  const sign = b > a ? 1 : -1;
  const r = new Date(a);
  let count = 0;
  while (r.getTime() !== b.getTime()) {
    r.setDate(r.getDate() + sign);
    if (isWorkday(r, holidays)) count++;
  }
  return sign * count;
}

/** Accepts a Date, dd/mm/yyyy, yyyy-mm-dd, or empty. Returns a Date at midnight, or null. */
function parseDate_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? null : startOfDay_(v);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return validDate_(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (m) return validDate_(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]);
  return null;
}

function validDate_(y, m, d) {
  const dt = new Date(y, m, d);
  return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d ? dt : null;
}
