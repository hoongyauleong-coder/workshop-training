import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseRepo, appUrl } from '@/lib/repo';
import { adminClient } from '@/lib/supabase/admin';
import { fmt, todayMY } from '@/lib/dates';
import type { Evidence, LogEntry } from '@/lib/types';
import {
  cancelAction, closeCarAction, extensionAction, reassignAction, rejectEvidenceAction, sendOneCar, updateCarDetails
} from '../../actions';
import { Banner, DueCell, StatusBadge } from '../../ui';
import { CarFields } from '../../CarFields';

export default async function CarPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const repo = supabaseRepo();
  const car = await repo.carById(id);
  if (!car) notFound();
  const db = adminClient();
  const [s, hol, evRes, logRes] = await Promise.all([
    repo.settings(), repo.holidays(),
    db.from('evidence').select('*').eq('car_id', id).order('submitted_at', { ascending: false }),
    car.car_no ? db.from('email_log').select('*').eq('car_no', car.car_no).order('ts', { ascending: false }).limit(100) : Promise.resolve({ data: [] })
  ]);
  const evidence = (evRes.data ?? []) as Evidence[];
  const log = (logRes.data ?? []) as LogEntry[];
  const today = s.simulated_today || todayMY();

  const paths = evidence.flatMap(e => e.files.map(f => f.path));
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await db.storage.from('evidence').createSignedUrls(paths, 3600);
    (data ?? []).forEach(d => { if (d.path && d.signedUrl) signed.set(d.path, d.signedUrl); });
  }

  const st = car.status;
  const canClose = ['Sent', 'Acknowledged', 'Evidence Submitted', 'Disputed'].includes(st);
  const canExtend = st === 'Acknowledged' || st === 'Evidence Submitted';
  const canReassign = ['Sent', 'Acknowledged', 'Evidence Submitted', 'Disputed'].includes(st);
  const canCancel = st !== 'Closed' && st !== 'Cancelled';
  const fmtTs = (ts?: string) => ts ? new Date(ts).toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'short', timeStyle: 'short' }) : '';

  return (
    <>
      <div className="head">
        <div>
          <div className="muted small"><Link href="/">← Dashboard</Link></div>
          <h1>{car.car_no || 'CAR baharu (belum dihantar)'} <StatusBadge status={st} /></h1>
          <div className="muted">{car.area}{car.severity && ` · ${car.severity}`}</div>
        </div>
        {st === 'New' && <form action={sendOneCar.bind(null, id)}><button className="primary" type="submit">📨 Hantar sekarang / Send now</button></form>}
      </div>
      <Banner ok={sp.ok} err={sp.err} />

      <div className="grid2">
        <div className="panel">
          <h2>Status</h2>
          <dl className="kv">
            <dt>Pemilik / Owner</dt><dd>{car.owner_name} <span className="muted small">{car.owner_email}</span></dd>
            <dt>HOD</dt><dd>{car.hod_name} <span className="muted small">{car.hod_email}</span></dd>
            <dt>Dihantar / Sent</dt><dd>{fmt(car.sent_date) || '–'}{car.ack_reminders > 0 && <span className="muted small"> · {car.ack_reminders} ack reminder(s)</span>}</dd>
            <dt>Disahkan / Acknowledged</dt><dd>{fmt(car.ack_date) || '–'}</dd>
            <dt>Tarikh akhir / Due</dt><dd><DueCell car={car} today={today} hol={hol} /></dd>
            <dt>Peringatan terakhir</dt><dd>{car.last_stage || '–'} {car.last_sent && <span className="muted small">({fmt(car.last_sent)})</span>}</dd>
            <dt>Ditutup / Closed</dt><dd>{fmt(car.closed_date) || '–'} {car.verified_by && <span className="muted small">by {car.verified_by}</span>}</dd>
            {car.token && <><dt>Owner link</dt><dd className="small"><a href={`${appUrl()}/o/${car.token}`} target="_blank" rel="noreferrer">Open owner page ↗</a></dd></>}
          </dl>
          {car.remarks && <><h2 style={{ marginTop: 16 }}>Catatan / Remarks</h2><div className="pre small">{car.remarks}</div></>}
        </div>

        <div className="panel">
          <h2>Tindakan / Actions</h2>
          <div style={{ display: 'grid', gap: 16 }}>
            {st === 'Evidence Submitted' && (
              <div className="banner warn" style={{ margin: 0 }}>Bukti menunggu semakan anda. Review the evidence below, then close or reject.</div>
            )}
            {canClose && (
              <form action={closeCarAction.bind(null, id)}>
                <button className="ok" type="submit">✅ Tutup CAR / Close (evidence verified)</button>
              </form>
            )}
            {st === 'Evidence Submitted' && (
              <form action={rejectEvidenceAction.bind(null, id)} style={{ display: 'grid', gap: 8 }}>
                <label>Tolak bukti – sebab / Reject evidence – reason (sent to owner)<textarea name="reason" required style={{ minHeight: 60 }} /></label>
                <div><button type="submit">↩️ Tolak bukti / Reject</button></div>
              </form>
            )}
            {canExtend && (
              <form action={extensionAction.bind(null, id)} className="row" style={{ alignItems: 'flex-end' }}>
                <label style={{ flex: 1 }}>Lanjutan / New due date<input name="new_due" type="date" required /></label>
                <button type="submit">📅 Lulus lanjutan</button>
              </form>
            )}
            {canReassign && (
              <form action={reassignAction.bind(null, id)} style={{ display: 'grid', gap: 8 }}>
                <div className="fields">
                  <label>Pemilik baharu / New owner<input name="owner_name" required /></label>
                  <label>Email<input name="owner_email" type="email" required /></label>
                </div>
                <div><button type="submit">👤 Tukar pemilik / Reassign</button></div>
              </form>
            )}
            {canCancel && (
              <form action={cancelAction.bind(null, id)} className="row" style={{ alignItems: 'flex-end' }}>
                <label style={{ flex: 1 }}>Batal – sebab / Cancel – reason<input name="reason" /></label>
                <button className="danger" type="submit">Batal / Cancel</button>
              </form>
            )}
            {!canClose && !canCancel && <p className="muted">Tiada tindakan / No actions for this status.</p>}
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Bukti / Evidence</h2>
        {evidence.length === 0 ? <p className="muted">Belum ada bukti / No evidence submitted yet.</p> : evidence.map(e => (
          <div key={e.id} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 14, marginBottom: 14 }}>
            <div className="row between">
              <b>{fmtTs(e.submitted_at)}</b>
              <span className="badge" data-s={e.decision === 'Accepted' ? 'Closed' : e.decision === 'Rejected' ? 'Disputed' : 'Evidence Submitted'}>{e.decision}</span>
            </div>
            <p style={{ margin: '8px 0 4px' }}><b>Punca / Root cause:</b> <span className="pre">{e.root_cause}</span></p>
            <p style={{ margin: '4px 0' }}><b>Tindakan / Action taken:</b> <span className="pre">{e.action_taken}</span></p>
            {e.decision_reason && <p className="small" style={{ color: 'var(--bad)' }}>Rejected: {e.decision_reason}</p>}
            <div className="thumbs">
              {e.files.map(f => {
                const url = signed.get(f.path);
                return url && f.type.startsWith('image/') && f.type !== 'image/heic'
                  ? <a key={f.path} href={url} target="_blank" rel="noreferrer">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={url} alt={f.name} /></a>
                  : <a key={f.path} href={url} target="_blank" rel="noreferrer"><div className="file">📄 {f.name}</div></a>;
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <h2>Butiran / Details</h2>
        <form action={updateCarDetails.bind(null, id)} style={{ display: 'grid', gap: 14 }}>
          <CarFields car={car} lockOwner={st !== 'New'} />
          {st !== 'New' && <p className="muted small" style={{ margin: 0 }}>Owner is locked after sending. Use Reassign to change it.</p>}
          <div><button type="submit">Simpan / Save details</button></div>
        </form>
      </div>

      <div className="panel">
        <h2>Sejarah / Timeline</h2>
        {log.length === 0 ? <p className="muted">–</p> : (
          <ul className="timeline">
            {log.map(l => (
              <li key={l.id}>
                <b>{fmtTs(l.ts)}</b> · {l.event}{l.mode === 'TEST' && <span className="muted"> (test)</span>}
                {l.to_addr && <span className="muted"> → {l.to_addr}{l.cc_addr && ` cc ${l.cc_addr}`}</span>}
                <div className="muted">{l.detail}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
