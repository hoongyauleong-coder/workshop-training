import { Fragment } from 'react';
import type { Metadata } from 'next';
import { supabaseRepo } from '@/lib/repo';
import { fmt } from '@/lib/dates';
import OwnerPanel from './OwnerPanel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'CAR/PAR', robots: { index: false, follow: false }, referrer: 'no-referrer' };

const STATUS_TEXT: Record<string, string> = {
  'Sent': 'Menunggu pengesahan anda / Waiting for your acknowledgement',
  'Acknowledged': 'Dalam tindakan / In progress – submit evidence before the due date',
  'Evidence Submitted': 'Bukti sedang disemak / Evidence under review by the auditor',
  'Disputed': 'Dipertikai – menunggu auditor / Disputed – waiting for the auditor',
  'Closed': 'Ditutup / Closed – terima kasih',
  'Cancelled': 'Dibatalkan / Cancelled'
};

export default async function OwnerPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ do?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const repo = supabaseRepo();
  const [car, s] = await Promise.all([repo.carByToken(token), repo.settings()]);

  if (!car) {
    return (
      <div className="owner"><div className="card" style={{ ['--c' as string]: 'var(--bad)' }}>
        <h1>Pautan tidak sah / Invalid link</h1>
        <p className="muted">This link is invalid or has expired (the CAR may have been reassigned). Sila hubungi Jabatan Pematuhan.</p>
      </div></div>
    );
  }
  const due = car.extension_due || car.due_date;
  const rows: [string, string][] = [
    ['Kawasan / Area', car.area], ['Penemuan / Finding', car.finding], ['Rujukan / Requirement', car.requirement_ref],
    ['Tahap / Severity', car.severity], ['Pemilik / Owner', car.owner_name], ['Tarikh akhir / Due', fmt(due)]
  ];
  return (
    <div className="owner">
      <div className="card">
        <div className="eyebrow">{s.dept}</div>
        <h1>{car.car_no}</h1>
        <p style={{ margin: '4px 0 14px' }}><span className="badge" data-s={car.status}>{STATUS_TEXT[car.status] ?? car.status}</span></p>
        <dl className="kv">{rows.filter(r => r[1]).map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd className="pre">{v}</dd></Fragment>)}</dl>
      </div>
      <OwnerPanel token={token} status={car.status} focus={sp.do} />
      <p className="muted small" style={{ textAlign: 'center' }}>{s.auditor_name} · {s.auditor_title} · {s.dept}</p>
    </div>
  );
}
