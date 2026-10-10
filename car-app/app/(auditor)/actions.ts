'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAuditor } from '@/lib/auth';
import * as E from '@/lib/engine';
import { liveCtx } from '@/lib/repo';
import { adminClient } from '@/lib/supabase/admin';
import { sessionClient } from '@/lib/supabase/server';
import { parseImport } from '@/lib/csv';
import { parseDateInput } from '@/lib/dates';
import type { NewCar } from '@/lib/types';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

/** Runs fn as a verified auditor, then redirects back with ?ok= or ?err=. */
async function guarded(back: string, fn: (who: { email: string; name: string }) => Promise<string | { msg: string; back: string }>): Promise<never> {
  const who = await requireAuditor();
  let ok = true, msg: string;
  try {
    const r = await fn(who);
    if (typeof r === 'string') msg = r;
    else { msg = r.msg; back = r.back; }
  } catch (e) {
    ok = false;
    msg = e instanceof Error ? e.message : String(e);
  }
  revalidatePath('/', 'layout');
  redirect(`${back}${back.includes('?') ? '&' : '?'}${ok ? 'ok' : 'err'}=${encodeURIComponent(msg)}`);
}

function carFields(f: FormData): NewCar {
  return {
    car_no: str(f, 'car_no') || null,
    area: str(f, 'area'),
    finding: str(f, 'finding'),
    requirement_ref: str(f, 'requirement_ref'),
    severity: str(f, 'severity'),
    owner_name: str(f, 'owner_name'),
    owner_email: str(f, 'owner_email'),
    hod_name: str(f, 'hod_name'),
    hod_email: str(f, 'hod_email')
  };
}

// ---------- dashboard ----------

export async function sendAllNew() {
  await guarded('/', async () => {
    const r = await E.sendNewCars(liveCtx());
    return `${r.sent} CAR sent.` + (r.skipped.length ? ` Skipped (missing owner email): ${r.skipped.join(', ')}` : '');
  });
}

export async function runRemindersNow() {
  await guarded('/', async () => {
    const r = await E.runReminders(liveCtx());
    if (r.skipped) return 'Hari ini bukan hari bekerja (weekend / public holiday). No reminders sent.';
    return `${r.sent} reminder(s) sent.` + (r.errors.length ? `\nErrors: ${r.errors.join('; ')}` : '');
  });
}

// ---------- create ----------

export async function createCar(f: FormData) {
  await guarded('/cars/new', async () => {
    const fields = carFields(f);
    if (!fields.finding) throw new Error('Finding is required.');
    const ctx = liveCtx();
    const [car] = await E.createCars(ctx, [fields]);
    if (f.get('send_now')) {
      try {
        const sent = await E.sendCar(ctx, car.id);
        return { msg: `${sent.car_no} created and sent to ${sent.owner_email}.`, back: `/cars/${car.id}` };
      } catch (e) {
        return { msg: `CAR saved but not sent: ${e instanceof Error ? e.message : e}`, back: `/cars/${car.id}` };
      }
    }
    return { msg: 'CAR saved as New. Click "Send now" when ready.', back: `/cars/${car.id}` };
  });
}

export async function importCars(f: FormData) {
  await guarded('/', async () => {
    const { rows, errors } = parseImport(str(f, 'paste'));
    if (!rows.length) throw new Error(errors.join('\n') || 'Nothing to import.');
    const created = await E.createCars(liveCtx(), rows);
    return `${created.length} CAR(s) imported as New. Check owner emails, then click "Send new CARs".` + (errors.length ? `\n${errors.join('\n')}` : '');
  });
}

// ---------- one car ----------

export async function updateCarDetails(id: string, f: FormData) {
  await guarded(`/cars/${id}`, async () => {
    const car = await liveCtx().repo.carById(id);
    if (!car) throw new Error('CAR not found.');
    const fields = carFields(f);
    if (!fields.finding) throw new Error('Finding is required.');
    const patch: Partial<NewCar> = { ...fields };
    if (car.status !== 'New') { // owner & number are fixed once sent – use Reassign instead
      delete patch.owner_name; delete patch.owner_email; delete patch.car_no;
    }
    const { error } = await adminClient().from('cars').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
    return 'Saved.';
  });
}

export async function sendOneCar(id: string) {
  await guarded(`/cars/${id}`, async () => {
    const car = await E.sendCar(liveCtx(), id);
    return `${car.car_no} sent to ${car.owner_email}.`;
  });
}

export async function closeCarAction(id: string) {
  await guarded(`/cars/${id}`, async who => {
    const car = await E.closeCar(liveCtx(), id, who.name);
    return `${car.car_no} closed. Owner and HOD notified.`;
  });
}

export async function rejectEvidenceAction(id: string, f: FormData) {
  await guarded(`/cars/${id}`, async () => {
    await E.rejectEvidence(liveCtx(), id, str(f, 'reason'));
    return 'Evidence rejected. Owner notified; reminders resume.';
  });
}

export async function extensionAction(id: string, f: FormData) {
  await guarded(`/cars/${id}`, async () => {
    const d = parseDateInput(str(f, 'new_due'));
    if (!d) throw new Error('Enter a valid date.');
    await E.approveExtension(liveCtx(), id, d);
    return 'Extension approved. Owner and HOD notified.';
  });
}

export async function reassignAction(id: string, f: FormData) {
  await guarded(`/cars/${id}`, async () => {
    const car = await E.reassign(liveCtx(), id, str(f, 'owner_name'), str(f, 'owner_email'));
    return `Reassigned to ${car.owner_name}. A new notice was sent; the old link no longer works.`;
  });
}

export async function cancelAction(id: string, f: FormData) {
  await guarded(`/cars/${id}`, async () => {
    await E.cancelCar(liveCtx(), id, str(f, 'reason'));
    return 'CAR cancelled. No further emails will be sent.';
  });
}

// ---------- settings ----------

export async function saveSettings(f: FormData) {
  await guarded('/settings', async () => {
    const int = (k: string, min: number) => {
      const n = Number(str(f, k));
      if (!Number.isInteger(n) || n < min) throw new Error(`"${k}" must be a whole number ≥ ${min}.`);
      return n;
    };
    const sim = str(f, 'simulated_today');
    const simDate = sim ? parseDateInput(sim) : null;
    if (sim && !simDate) throw new Error('Simulated today: enter a valid date or leave blank.');
    const { error } = await adminClient().from('settings').update({
      closure_wd: int('closure_wd', 1), pre_wd: int('pre_wd', 0), r1_wd: int('r1_wd', 1), r2_gap: int('r2_gap', 1),
      repeat_gap: int('repeat_gap', 1), eff_wd: int('eff_wd', 0),
      auditor_name: str(f, 'auditor_name'), auditor_title: str(f, 'auditor_title'), dept: str(f, 'dept'),
      auditor_email: str(f, 'auditor_email'), extra_cc: str(f, 'extra_cc'), car_prefix: str(f, 'car_prefix') || 'CAR',
      test_mode: f.get('test_mode') === 'on', simulated_today: simDate
    }).eq('id', 1);
    if (error) throw new Error(error.message);
    return 'Settings saved.';
  });
}

export async function addHoliday(f: FormData) {
  await guarded('/settings', async () => {
    const d = parseDateInput(str(f, 'date'));
    if (!d || !str(f, 'name')) throw new Error('Holiday needs a valid date and a name.');
    const { error } = await adminClient().from('holidays').upsert({ date: d, name: str(f, 'name'), note: str(f, 'note') });
    if (error) throw new Error(error.message);
    return 'Holiday saved.';
  });
}

export async function deleteHoliday(date: string) {
  await guarded('/settings', async () => {
    const { error } = await adminClient().from('holidays').delete().eq('date', date);
    if (error) throw new Error(error.message);
    return 'Holiday removed.';
  });
}

export async function addAuditor(f: FormData) {
  await guarded('/settings', async () => {
    const email = str(f, 'email').toLowerCase();
    const password = str(f, 'password');
    if (!/@/.test(email)) throw new Error('Enter a valid email.');
    if (password.length < 10) throw new Error('Temporary password must be at least 10 characters.');
    const db = adminClient();
    const { error: authErr } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (authErr && !/already/i.test(authErr.message)) throw new Error(authErr.message);
    const { error } = await db.from('auditors').upsert({ email, name: str(f, 'name') });
    if (error) throw new Error(error.message);
    return `${email} can now sign in. Give them the temporary password and ask them to change it in Settings.`;
  });
}

export async function removeAuditor(email: string) {
  await guarded('/settings', async who => {
    if (email.toLowerCase() === who.email) throw new Error('You cannot remove yourself.');
    const { error } = await adminClient().from('auditors').delete().eq('email', email);
    if (error) throw new Error(error.message);
    return `${email} removed from auditors.`;
  });
}

export async function changePassword(f: FormData) {
  await guarded('/settings', async () => {
    const pw = str(f, 'password');
    if (pw.length < 10) throw new Error('Password must be at least 10 characters.');
    if (pw !== str(f, 'confirm')) throw new Error('Passwords do not match.');
    const { error } = await (await sessionClient()).auth.updateUser({ password: pw });
    if (error) throw new Error(error.message);
    return 'Password changed.';
  });
}
