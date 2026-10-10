import Link from 'next/link';
import { adminClient } from '@/lib/supabase/admin';
import type { LogEntry } from '@/lib/types';

export default async function LogPage({ searchParams }: { searchParams: Promise<{ car?: string }> }) {
  const { car } = await searchParams;
  let q = adminClient().from('email_log').select('*').order('ts', { ascending: false }).limit(300);
  if (car) q = q.eq('car_no', car);
  const { data } = await q;
  const rows = (data ?? []) as LogEntry[];
  return (
    <>
      <div className="head">
        <div><h1>Email &amp; activity log</h1><div className="muted small">Latest 300 entries{car && <> for <b>{car}</b> · <Link href="/log">show all</Link></>}. Audit evidence for every email sent.</div></div>
      </div>
      <div className="table-wrap">
        <table className="list">
          <thead><tr><th>Masa / Time</th><th>CAR</th><th>Event</th><th>To / CC</th><th>Subject / Detail</th></tr></thead>
          <tbody>
            {rows.map(l => (
              <tr key={l.id}>
                <td className="small" style={{ whiteSpace: 'nowrap' }}>{new Date(l.ts!).toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'short', timeStyle: 'short' })}</td>
                <td><Link href={`/log?car=${encodeURIComponent(l.car_no)}`}>{l.car_no}</Link></td>
                <td className="small">{l.event}{l.mode === 'TEST' && <div className="badge" data-s="Sent">TEST</div>}</td>
                <td className="small">{l.to_addr}{l.cc_addr && <div className="muted">cc {l.cc_addr}</div>}</td>
                <td className="small">{l.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
