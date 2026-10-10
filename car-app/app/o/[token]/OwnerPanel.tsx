'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { browserClient } from '@/lib/supabase/browser';
import { ackAction, disputeAction, submitEvidenceAction, uploadTicketsAction, type Result } from '../actions';

export default function OwnerPanel({ token, status, focus }: { token: string; status: string; focus?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  const [showDispute, setShowDispute] = useState(focus === 'dispute');
  const focusRef = useRef<HTMLDivElement>(null);

  useEffect(() => { focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, []);

  const done = (r: Result) => { setResult(r); if (r.ok) router.refresh(); };

  const canAck = status === 'Sent' || status === 'Disputed';
  const canDispute = status === 'Sent' || status === 'Acknowledged';
  const canEvidence = status === 'Sent' || status === 'Acknowledged';

  async function onEvidence(form: HTMLFormElement) {
    const fd = new FormData(form);
    const files = (fd.getAll('files') as File[]).filter(f => f.size > 0);
    const rootCause = String(fd.get('root_cause') || ''), actionTaken = String(fd.get('action_taken') || '');
    const t = await uploadTicketsAction(token, files.map(f => ({ name: f.name, type: f.type || 'application/octet-stream', size: f.size })));
    if (!t.ok) return setResult({ ok: false, message: t.message });
    const storage = browserClient().storage.from('evidence');
    for (const [i, ticket] of t.tickets.entries()) {
      const { error } = await storage.uploadToSignedUrl(ticket.path, ticket.token, files[i], { contentType: ticket.type });
      if (error) return setResult({ ok: false, message: `Muat naik gagal / Upload failed: ${files[i].name}` });
    }
    done(await submitEvidenceAction(token, rootCause, actionTaken, t.tickets.map(({ token: _t, ...f }) => f)));
  }

  return (
    <>
      {result && <div className={`banner ${result.ok ? 'ok' : 'err'}`}>{result.message}</div>}

      {canAck && (
        <div className={`card ${focus === 'ack' ? 'focus' : ''}`} ref={focus === 'ack' ? focusRef : undefined} style={{ ['--c' as string]: 'var(--ok)' }}>
          <h2>Sahkan penerimaan / Acknowledge</h2>
          <p className="muted">By clicking below you confirm you have received this non-conformance. The closure period starts today.</p>
          <button className="ok" disabled={pending} onClick={() => start(async () => done(await ackAction(token)))}>
            {pending ? 'Menghantar…' : '✔ RECEIVED / DITERIMA'}
          </button>
        </div>
      )}

      {canEvidence && (
        <div className={`card ${focus === 'evidence' ? 'focus' : ''}`} ref={focus === 'evidence' ? focusRef : undefined}>
          <h2>Hantar bukti penutupan / Submit closure evidence</h2>
          <form onSubmit={e => { e.preventDefault(); const f = e.currentTarget; start(() => onEvidence(f)); }} style={{ display: 'grid', gap: 12 }}>
            <label>Punca masalah / Root cause *<textarea name="root_cause" required /></label>
            <label>Tindakan pembetulan diambil / Corrective action taken *<textarea name="action_taken" required /></label>
            <label>Gambar / dokumen (photos or PDF, max 10 files, 10 MB each)
              <input name="files" type="file" multiple accept="image/jpeg,image/png,image/heic,image/webp,application/pdf" />
            </label>
            <div><button className="primary" type="submit" disabled={pending}>{pending ? 'Memuat naik… / Uploading…' : 'Hantar bukti / Submit evidence'}</button></div>
          </form>
        </div>
      )}

      {canDispute && (
        <div className={`card ${focus === 'dispute' ? 'focus' : ''}`} ref={focus === 'dispute' ? focusRef : undefined} style={{ ['--c' as string]: 'var(--muted)' }}>
          {!showDispute ? (
            <button onClick={() => setShowDispute(true)}>Bukan kawasan saya / Dispute this CAR</button>
          ) : (
            <form onSubmit={e => { e.preventDefault(); const reason = String(new FormData(e.currentTarget).get('reason') || ''); start(async () => done(await disputeAction(token, reason))); }} style={{ display: 'grid', gap: 12 }}>
              <h2>Pertikaian / Dispute</h2>
              <label>Sebab / Reason (e.g. not my area – correct owner is …)<textarea name="reason" required /></label>
              <div><button type="submit" disabled={pending}>Hantar / Submit</button></div>
            </form>
          )}
        </div>
      )}
    </>
  );
}
