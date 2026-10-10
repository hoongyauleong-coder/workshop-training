import type { Car } from '@/lib/types';
import { fmt, workdaysBetween } from '@/lib/dates';

export function Banner({ ok, err }: { ok?: string; err?: string }) {
  if (err) return <div className="banner err">{err}</div>;
  if (ok) return <div className="banner ok">{ok}</div>;
  return null;
}

export function StatusBadge({ status }: { status: string }) {
  return <span className="badge" data-s={status}>{status}</span>;
}

export function effectiveDue(car: Car): string | null {
  return car.extension_due || car.due_date;
}

/** Working days overdue (> 0) for an acknowledged car, else 0. */
export function daysLate(car: Car, today: string, hol: Set<string>): number {
  const due = effectiveDue(car);
  if (car.status !== 'Acknowledged' || !due || due >= today) return 0;
  return workdaysBetween(due, today, hol);
}

export function DueCell({ car, today, hol }: { car: Car; today: string; hol: Set<string> }) {
  const due = effectiveDue(car);
  if (!due) return <span className="muted">–</span>;
  const late = daysLate(car, today, hol);
  return (
    <>
      {fmt(due)}
      {car.extension_due && <span className="muted small"> (ext)</span>}
      {late > 0 && <> <span className="badge late">+{late} WD</span></>}
    </>
  );
}
