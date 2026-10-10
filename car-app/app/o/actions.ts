'use server';
import * as E from '@/lib/engine';
import { liveCtx, supabaseRepo } from '@/lib/repo';
import { adminClient } from '@/lib/supabase/admin';
import { fmt } from '@/lib/dates';
import type { EvidenceFile } from '@/lib/types';

export interface Result { ok: boolean; message: string }

const ALLOWED = ['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf'];
const MAX_FILES = 10, MAX_BYTES = 10 * 1024 * 1024;

async function wrap(fn: () => Promise<string>): Promise<Result> {
  try {
    return { ok: true, message: await fn() };
  } catch (e) {
    const known = e instanceof E.WorkflowError;
    if (!known) console.error(e);
    return { ok: false, message: known ? e.message : 'Ralat sistem / System error. Please try again or reply to the email.' };
  }
}

export async function ackAction(token: string): Promise<Result> {
  return wrap(async () => {
    const r = await E.acknowledge(liveCtx(), token);
    const due = r.car.extension_due || r.car.due_date;
    return r.already
      ? `Telah disahkan sebelum ini / Already acknowledged.${due ? ` Tarikh akhir / Due: ${fmt(due)}` : ''}`
      : `Penerimaan disahkan ✔ Tarikh akhir penutupan / Closure due date: ${fmt(due)}. A confirmation email has been sent to you.`;
  });
}

export async function disputeAction(token: string, reason: string): Promise<Result> {
  return wrap(async () => {
    await E.dispute(liveCtx(), token, reason);
    return 'Pertikaian dihantar / Dispute submitted. The auditor will review it and contact you.';
  });
}

export interface UploadTicket extends EvidenceFile { token: string }

/** Signed upload URLs so photos go straight from the phone to Supabase Storage (no size limit from Vercel). */
export async function uploadTicketsAction(token: string, files: { name: string; type: string; size: number }[]): Promise<{ ok: boolean; message: string; tickets: UploadTicket[] }> {
  try {
    const car = await supabaseRepo().carByToken(token);
    if (!car) throw new E.WorkflowError('This link is invalid or has expired.');
    if (car.status !== 'Sent' && car.status !== 'Acknowledged') throw new E.WorkflowError(`Evidence cannot be submitted now (status: ${car.status}).`);
    if (files.length > MAX_FILES) throw new E.WorkflowError(`Maksimum ${MAX_FILES} fail / max ${MAX_FILES} files.`);
    const storage = adminClient().storage.from('evidence');
    const stamp = Date.now();
    const tickets: UploadTicket[] = [];
    for (const [i, f] of files.entries()) {
      if (!ALLOWED.includes(f.type)) throw new E.WorkflowError(`${f.name}: only photos (JPG, PNG, HEIC, WEBP) and PDF are allowed.`);
      if (f.size > MAX_BYTES) throw new E.WorkflowError(`${f.name}: file is larger than 10 MB.`);
      const safe = f.name.replace(/[^\w.\-]+/g, '_').slice(-80);
      const path = `${car.id}/${stamp}-${i}-${safe}`;
      const { data, error } = await storage.createSignedUploadUrl(path);
      if (error || !data) throw new Error(error?.message || 'upload url failed');
      tickets.push({ path, token: data.token, name: f.name, type: f.type, size: f.size });
    }
    return { ok: true, message: '', tickets };
  } catch (e) {
    return { ok: false, message: e instanceof E.WorkflowError ? e.message : 'Ralat sistem / System error.', tickets: [] };
  }
}

export async function submitEvidenceAction(token: string, rootCause: string, actionTaken: string, files: EvidenceFile[]): Promise<Result> {
  return wrap(async () => {
    await E.submitEvidence(liveCtx(), token, {
      rootCause, actionTaken,
      files: files.slice(0, MAX_FILES).map(f => ({ path: f.path, name: f.name, type: f.type, size: f.size }))
    });
    return 'Bukti dihantar ✔ Evidence submitted. The auditor will verify it and you will receive an email when the CAR is closed.';
  });
}
