import Link from 'next/link';
import { supabaseRepo } from '@/lib/repo';
import { fmt, todayMY } from '@/lib/dates';
import { STATUSES } from '@/lib/types';
import { runRemindersNow, sendAllNew } from './actions';
import { Banner, DueCell, StatusBadge, daysLate } from './ui';

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; s?: string }> }) {
  const sp = await searchParams;
  const repo = supabaseRepo();
  const [s, hol, cars] = await Promise.all([repo.settings(), repo.holidays(), repo.cars()]);
  const today = s.simulated_today || todayMY();
  const count = (st: string) => cars.filter(c => c.status === st).length;
  const overdue = cars.filter(c => daysLate(c, today, hol) > 0);
  const closed = cars.filter(c => c.status === 'Closed');
  const onTime = closed.filter(c => c.closed_date && (c.extension_due || c.due_date) && c.closed_date <= (c.extension_due || c.due_date)!).length;

  const filter = sp.s || 'open';
  const shown = cars
    .filter(c => filter === 'all' ? true : filter === 'open' ? !['Closed', 'Cancelled'].includes(c.status) : filter === 'overdue' ? daysLate(c, today, hol) > 0 : c.status === filter)
    .sort((a, b) => daysLate(b, today, hol) - daysLate(a, today, hol) || (b.created_at ?? '').localeCompare(a.created_at ?? ''));

  const stats: [string, number, string, string][] = [
    ['New', count('New'), 'Belum dihantar', 'var(--muted)'],
    ['Sent', count('Sent'), 'Menunggu pengesahan', 'var(--warn)'],
    ['Acknowledged', count('Acknowledged'), 'Dalam tindakan', 'var(--info)'],
    ['overdue', overdue.length, 'Lewat / overdue', 'var(--bad)'],
    ['Evidence Submitted', count('Evidence Submitted'), 'Bukti untuk disemak', 'var(--firm)'],
    ['Disputed', count('Disputed'), 'Dipertikai', 'var(--bad)'],
    ['Closed', closed.length, `Ditutup · ${closed.length ? Math.round((onTime / closed.length) * 100) : 0}% on time`, 'var(--ok)']
  ];

  return (
    <>
      <div className="head">
        <div>
          <h1>CAR/PAR Dashboard</h1>
          <div className="muted small">
            Hari ini / Today: <b>{fmt(today)}</b>
            {s.simulated_today && <span className="badge late" style={{ marginLeft: 8 }}>SIMULATED DATE</span>}
            {s.test_mode && <span className="badge" data-s="Sent" style={{ marginLeft: 8 }}>TEST MODE – emails go to you only</span>}
          </div>
        </div>
        <div className="row">
          <form action={sendAllNew}><button className="primary" type="submit">📨 Hantar CAR baharu ({count('New')})</button></form>
          <form action={runRemindersNow}><button type="submit">⏰ Run reminders now</button></form>
        </div>
      </div>
      <Banner ok={sp.ok} err={sp.err} />

      <div className="stats">
        {stats.map(([key, n, label, c]) => (
          <Link key={key} href={`/?s=${encodeURIComponent(key)}`} className="stat" style={{ ['--c' as string]: c }}>
            <b>{n}</b><span>{label}</span>
          </Link>
        ))}
      </div>

      <div className="tabs">
        {[['open', 'Belum ditutup / Open'], ['overdue', 'Lewat'], ...STATUSES.map(x => [x, x]), ['all', 'Semua / All']].map(([k, label]) => (
          <Link key={k} href={`/?s=${encodeURIComponent(k)}`} className={filter === k ? 'on' : ''}>{label}</Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="panel muted">Tiada CAR dalam senarai ini. <Link href="/cars/new">Tambah CAR baharu →</Link></div>
      ) : (
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr><th>CAR No</th><th>Area</th><th>Finding</th><th>Owner</th><th>Status</th><th>Due</th><th>Last email</th></tr>
            </thead>
            <tbody>
              {shown.map(c => (
                <tr key={c.id} className={daysLate(c, today, hol) > 0 ? 'overdue' : ''}>
                  <td><Link className="car" href={`/cars/${c.id}`}>{c.car_no || 'New ›'}</Link></td>
                  <td>{c.area}</td>
                  <td style={{ maxWidth: 320 }}>{c.finding}</td>
                  <td>{c.owner_name}<div className="muted small">{c.owner_email || <span style={{ color: 'var(--bad)' }}>no email</span>}</div></td>
                  <td><StatusBadge status={c.status} /></td>
                  <td><DueCell car={c} today={today} hol={hol} /></td>
                  <td className="small">{c.last_sent ? fmt(c.last_sent) : '–'}{c.last_stage && <div className="muted">{c.last_stage}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
