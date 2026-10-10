/**
 * CAR/PAR workflow engine. Pure business logic: storage and email are passed in (Repo, Mailer),
 * so the same code runs on Vercel and in the tests.
 *
 * Owner ladder after acknowledgement (working days):
 *   PRE   = due − pre_wd          friendly
 *   R1    = due + r1_wd           firm
 *   R2    = R1 + r2_gap           cc HOD
 *   R3#k  = R2 + k·repeat_gap     cc HOD (+ extra CC), repeats until Closed
 */
import { addWorkdays, isWorkday, todayMY, workdaysBetween, type ISODate } from './dates';
import * as T from './templates';
import type { Car, Evidence, EvidenceFile, LogEntry, NewCar, Settings, Status } from './types';

export interface Repo {
  settings(): Promise<Settings>;
  holidays(): Promise<Set<string>>;
  cars(statuses?: Status[]): Promise<Car[]>;
  carById(id: string): Promise<Car | null>;
  carByToken(token: string): Promise<Car | null>;
  /** Updates the car. With expectStatus, only updates if the status still matches (returns null otherwise). */
  updateCar(id: string, patch: Partial<Car>, expectStatus?: Status): Promise<Car | null>;
  insertCars(rows: NewCar[]): Promise<Car[]>;
  carNosLike(stem: string): Promise<string[]>;
  log(e: LogEntry): Promise<void>;
  addEvidence(e: Omit<Evidence, 'id' | 'submitted_at' | 'decision' | 'decision_reason'>): Promise<Evidence>;
  pendingEvidence(carId: string): Promise<Evidence | null>;
  updateEvidence(id: string, patch: Partial<Evidence>): Promise<void>;
}

export interface Mail { to: string; cc?: string; subject: string; html: string; text: string; replyTo?: string; fromName: string }
export interface Mailer { send(m: Mail): Promise<void> }

export interface Ctx {
  repo: Repo;
  mailer: Mailer;
  appUrl: string;
  /** Used when Settings ▸ auditor email is blank. */
  fallbackAuditorEmail: string;
  now?: () => Date;
  newToken?: () => string;
}

export class WorkflowError extends Error {}

// ---------- helpers ----------

function today(ctx: Ctx, s: Settings): ISODate {
  return s.simulated_today || todayMY(ctx.now ? ctx.now() : new Date());
}

function auditorEmail(ctx: Ctx, s: Settings): string {
  return s.auditor_email.trim() || ctx.fallbackAuditorEmail;
}

function token(ctx: Ctx): string {
  if (ctx.newToken) return ctx.newToken();
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function effectiveDue(car: Car): ISODate | null {
  return car.extension_due || car.due_date;
}

function remark(s: Settings, ctx: Ctx, car: Car, text: string): string {
  const [y, m, d] = today(ctx, s).split('-');
  const line = `[${d}/${m}/${y}] ${text}`;
  return car.remarks ? `${car.remarks}\n${line}` : line;
}

async function sendMail(ctx: Ctx, s: Settings, car: Car, event: string, to: string, ccList: string[], tpl: T.Tpl) {
  const cc = ccList.map(x => (x || '').trim()).filter((v, i, a) => v && a.indexOf(v) === i && v !== to).join(',');
  const auditor = auditorEmail(ctx, s);
  let sendTo = to, sendCc = cc, subject = tpl.subject, html = tpl.html;
  if (s.test_mode) {
    html = '<div style="font-family:Arial,sans-serif;background:#fbf3d6;color:#8a6d00;padding:10px 14px;border-radius:6px;margin-bottom:16px;font-size:13px">' +
      `<b>TEST MODE</b> – in live mode this email goes to: <b>${T.esc(to)}</b>${cc ? ` &nbsp;cc: <b>${T.esc(cc)}</b>` : ''}</div>` + html;
    subject = `[TEST] ${subject}`;
    sendTo = auditor;
    sendCc = '';
  }
  if (!sendTo) throw new WorkflowError(`No recipient for ${event} on ${car.car_no}`);
  await ctx.mailer.send({
    to: sendTo, cc: sendCc || undefined, subject, html, text: T.htmlToText(html),
    replyTo: auditor || undefined, fromName: `${s.auditor_name} – ${s.dept}`
  });
  await ctx.repo.log({ car_no: car.car_no ?? '', event, to_addr: to, cc_addr: cc, detail: subject, mode: s.test_mode ? 'TEST' : 'LIVE' });
}

function tctx(ctx: Ctx, s: Settings): T.TplCtx { return { s, appUrl: ctx.appUrl }; }

async function nextCarNo(ctx: Ctx, s: Settings): Promise<string> {
  const [y, m] = today(ctx, s).split('-');
  const stem = `${s.car_prefix}-${y}-${m}-`;
  const max = (await ctx.repo.carNosLike(stem)).reduce((acc, no) => Math.max(acc, Number(no.slice(stem.length)) || 0), 0);
  return stem + String(max + 1).padStart(3, '0');
}

// ---------- creating & sending ----------

export async function createCars(ctx: Ctx, rows: NewCar[]): Promise<Car[]> {
  const clean = rows.filter(r => r.finding.trim());
  return clean.length ? ctx.repo.insertCars(clean) : [];
}

/** Sends the NC notice for one car (status New). */
export async function sendCar(ctx: Ctx, carId: string): Promise<Car> {
  const s = await ctx.repo.settings();
  return sendOne(ctx, s, await mustCar(ctx, carId));
}

async function sendOne(ctx: Ctx, s: Settings, car: Car): Promise<Car> {
  if (car.status !== 'New') throw new WorkflowError(`${car.car_no ?? 'CAR'} has already been sent.`);
  if (!/@/.test(car.owner_email) || !car.finding.trim()) throw new WorkflowError('Owner email and finding are required before sending.');
  const t = today(ctx, s);
  const patch: Partial<Car> = { token: token(ctx), date_raised: car.date_raised || t };
  if (!car.car_no) patch.car_no = await nextCarNo(ctx, s);
  const ready = { ...car, ...patch } as Car;
  await sendMail(ctx, s, ready, 'NC_NOTICE', ready.owner_email, [], T.tplNotice(tctx(ctx, s), ready));
  const updated = await ctx.repo.updateCar(car.id, {
    ...patch, status: 'Sent', sent_date: t, last_sent: t, ack_reminders: 0, last_stage: ''
  });
  return updated ?? ready;
}

export async function sendNewCars(ctx: Ctx): Promise<{ sent: number; skipped: string[] }> {
  const s = await ctx.repo.settings();
  const out = { sent: 0, skipped: [] as string[] };
  for (const car of await ctx.repo.cars(['New'])) {
    if (!/@/.test(car.owner_email) || !car.finding.trim()) {
      out.skipped.push(car.car_no || car.finding.slice(0, 40));
      continue;
    }
    await sendOne(ctx, s, car);
    out.sent++;
  }
  return out;
}

// ---------- the daily run ----------

export function stageRank(stage: string): number {
  if (!stage) return 0;
  const base = ({ PRE: 1, R1: 2, R2: 3 } as Record<string, number>)[stage];
  if (base) return base;
  const m = /^R3#(\d+)$/.exec(stage);
  return m ? 3 + Number(m[1]) : 0;
}

export function ladderStage(due: ISODate, t: ISODate, s: Settings, hol: Set<string>): string {
  const pre = addWorkdays(due, -s.pre_wd, hol);
  const r1 = addWorkdays(due, Math.max(1, s.r1_wd), hol);
  const r2 = addWorkdays(r1, Math.max(1, s.r2_gap), hol);
  if (t >= r2) {
    const k = Math.floor(workdaysBetween(r2, t, hol) / Math.max(1, s.repeat_gap));
    return k >= 1 ? `R3#${k}` : 'R2';
  }
  if (t >= r1) return 'R1';
  if (s.pre_wd > 0 && t >= pre) return 'PRE';
  return '';
}

export async function runReminders(ctx: Ctx): Promise<{ skipped: boolean; sent: number; errors: string[] }> {
  const s = await ctx.repo.settings();
  const hol = await ctx.repo.holidays();
  const t = today(ctx, s);
  if (!isWorkday(t, hol)) return { skipped: true, sent: 0, errors: [] };
  let sent = 0;
  const errors: string[] = [];
  for (const car of await ctx.repo.cars(['Sent', 'Acknowledged', 'Closed'])) {
    try {
      sent += await processCar(ctx, s, hol, t, car);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${car.car_no}: ${msg}`);
      await ctx.repo.log({ car_no: car.car_no ?? '', event: 'ERROR', to_addr: '', cc_addr: '', detail: msg, mode: s.test_mode ? 'TEST' : 'LIVE' });
    }
  }
  return { skipped: false, sent, errors };
}

async function processCar(ctx: Ctx, s: Settings, hol: Set<string>, t: ISODate, car: Car): Promise<number> {
  const tc = tctx(ctx, s);
  if (car.status === 'Sent') {
    if (car.sent_date && car.sent_date < t && (!car.last_sent || car.last_sent < t)) {
      const n = (car.ack_reminders || 0) + 1;
      await sendMail(ctx, s, car, `ACK_REMINDER_${n}`, car.owner_email, [], T.tplAckReminder(tc, car, n));
      await ctx.repo.updateCar(car.id, { ack_reminders: n, last_sent: t });
      return 1;
    }
    return 0;
  }
  if (car.status === 'Acknowledged') {
    const due = effectiveDue(car);
    if (!due) return 0;
    const target = ladderStage(due, t, s, hol);
    if (stageRank(target) <= stageRank(car.last_stage)) return 0;
    if (target === 'PRE') {
      await sendMail(ctx, s, car, 'PRE_DEADLINE', car.owner_email, [], T.tplPre(tc, car, due));
    } else {
      const n = target === 'R1' ? 1 : target === 'R2' ? 2 : 2 + Number(target.split('#')[1]);
      const cc = n >= 2 ? [car.hod_email] : [];
      if (n >= 3 && s.extra_cc) cc.push(s.extra_cc);
      await sendMail(ctx, s, car, `REMINDER_${n}`, car.owner_email, cc, T.tplOverdue(tc, car, due, workdaysBetween(due, t, hol), n));
    }
    await ctx.repo.updateCar(car.id, { last_stage: target, last_sent: t });
    return 1;
  }
  if (car.status === 'Closed') {
    if (car.closed_date && s.eff_wd > 0 && car.last_stage !== 'EFFECT' && t >= addWorkdays(car.closed_date, s.eff_wd, hol)) {
      await sendMail(ctx, s, car, 'EFFECTIVENESS_CHECK', auditorEmail(ctx, s), [], T.tplEffectiveness(tc, car, car.closed_date));
      await ctx.repo.updateCar(car.id, { last_stage: 'EFFECT' });
      return 1;
    }
  }
  return 0;
}

// ---------- owner actions (via the token link) ----------

async function carForToken(ctx: Ctx, tok: string): Promise<Car> {
  const car = tok ? await ctx.repo.carByToken(tok) : null;
  if (!car) throw new WorkflowError('This link is invalid or has expired.');
  return car;
}

export async function acknowledge(ctx: Ctx, tok: string): Promise<{ car: Car; already: boolean }> {
  const s = await ctx.repo.settings();
  const car = await carForToken(ctx, tok);
  if (car.status !== 'Sent' && car.status !== 'Disputed') return { car, already: true };
  const t = today(ctx, s);
  const due = addWorkdays(t, s.closure_wd, await ctx.repo.holidays());
  const updated = await ctx.repo.updateCar(car.id, { ack_date: t, due_date: due, status: 'Acknowledged', last_stage: '' }, car.status);
  if (!updated) return { car: (await ctx.repo.carById(car.id)) ?? car, already: true }; // double click race
  await ctx.repo.log({ car_no: car.car_no ?? '', event: 'ACKNOWLEDGED', to_addr: car.owner_email, cc_addr: '', detail: 'Owner clicked Received', mode: s.test_mode ? 'TEST' : 'LIVE' });
  await sendMail(ctx, s, updated, 'ACK_CONFIRM', updated.owner_email, [], T.tplAckConfirm(tctx(ctx, s), updated, due));
  return { car: updated, already: false };
}

export async function dispute(ctx: Ctx, tok: string, reason: string): Promise<Car> {
  const s = await ctx.repo.settings();
  const car = await carForToken(ctx, tok);
  reason = reason.trim();
  if (!reason) throw new WorkflowError('Please state the reason for the dispute.');
  if (car.status !== 'Sent' && car.status !== 'Acknowledged') throw new WorkflowError(`This CAR cannot be disputed (status: ${car.status}).`);
  const updated = await ctx.repo.updateCar(car.id, { status: 'Disputed', remarks: remark(s, ctx, car, `Dispute by ${car.owner_name}: ${reason}`) }, car.status);
  if (!updated) throw new WorkflowError('This CAR was just updated. Please reload the page.');
  await ctx.repo.log({ car_no: car.car_no ?? '', event: 'DISPUTED', to_addr: car.owner_email, cc_addr: '', detail: reason, mode: s.test_mode ? 'TEST' : 'LIVE' });
  await sendMail(ctx, s, updated, 'DISPUTE_TO_AUDITOR', auditorEmail(ctx, s), [], T.tplDispute(tctx(ctx, s), updated, reason));
  return updated;
}

export async function submitEvidence(ctx: Ctx, tok: string, input: { rootCause: string; actionTaken: string; files: EvidenceFile[] }): Promise<Car> {
  const s = await ctx.repo.settings();
  const car = await carForToken(ctx, tok);
  const rootCause = input.rootCause.trim(), actionTaken = input.actionTaken.trim();
  if (!rootCause || !actionTaken) throw new WorkflowError('Root cause and corrective action are required.');
  if (input.files.some(f => !f.path.startsWith(`${car.id}/`))) throw new WorkflowError('Invalid file.');
  if (car.status !== 'Sent' && car.status !== 'Acknowledged') throw new WorkflowError(`Evidence cannot be submitted now (status: ${car.status}).`);
  const patch: Partial<Car> = { status: 'Evidence Submitted' };
  if (car.status === 'Sent') { // submitted without clicking Received: treat as acknowledged today
    const t = today(ctx, s);
    patch.ack_date = t;
    patch.due_date = addWorkdays(t, s.closure_wd, await ctx.repo.holidays());
  }
  const updated = await ctx.repo.updateCar(car.id, patch, car.status);
  if (!updated) throw new WorkflowError('This CAR was just updated. Please reload the page.');
  await ctx.repo.addEvidence({ car_id: car.id, root_cause: rootCause, action_taken: actionTaken, files: input.files });
  await ctx.repo.log({ car_no: car.car_no ?? '', event: 'EVIDENCE_SUBMITTED', to_addr: car.owner_email, cc_addr: '', detail: `${input.files.length} file(s)`, mode: s.test_mode ? 'TEST' : 'LIVE' });
  await sendMail(ctx, s, updated, 'EVIDENCE_TO_AUDITOR', auditorEmail(ctx, s), [], T.tplEvidenceReceived(tctx(ctx, s), updated, rootCause, actionTaken, input.files.length));
  return updated;
}

// ---------- auditor actions ----------

async function mustCar(ctx: Ctx, id: string): Promise<Car> {
  const car = await ctx.repo.carById(id);
  if (!car) throw new WorkflowError('CAR not found.');
  return car;
}

export async function closeCar(ctx: Ctx, id: string, verifiedBy?: string): Promise<Car> {
  const s = await ctx.repo.settings();
  const car = await mustCar(ctx, id);
  if (car.status === 'Closed' || car.status === 'Cancelled' || car.status === 'New') throw new WorkflowError(`Cannot close a CAR with status ${car.status}.`);
  const t = today(ctx, s);
  const updated = (await ctx.repo.updateCar(id, { status: 'Closed', closed_date: t, verified_by: verifiedBy || s.auditor_name, last_stage: '' }))!;
  const ev = await ctx.repo.pendingEvidence(id);
  if (ev) await ctx.repo.updateEvidence(ev.id, { decision: 'Accepted' });
  await sendMail(ctx, s, updated, 'CLOSED', updated.owner_email, [updated.hod_email], T.tplClosed(tctx(ctx, s), updated, t));
  return updated;
}

export async function rejectEvidence(ctx: Ctx, id: string, reason: string): Promise<Car> {
  const s = await ctx.repo.settings();
  const car = await mustCar(ctx, id);
  reason = reason.trim();
  if (!reason) throw new WorkflowError('A reason is required.');
  if (car.status !== 'Evidence Submitted') throw new WorkflowError('There is no evidence waiting for this CAR.');
  const updated = (await ctx.repo.updateCar(id, { status: 'Acknowledged', remarks: remark(s, ctx, car, `Evidence rejected: ${reason}`) }))!;
  const ev = await ctx.repo.pendingEvidence(id);
  if (ev) await ctx.repo.updateEvidence(ev.id, { decision: 'Rejected', decision_reason: reason });
  await sendMail(ctx, s, updated, 'EVIDENCE_REJECTED', updated.owner_email, [], T.tplEvidenceRejected(tctx(ctx, s), updated, reason, effectiveDue(updated)));
  return updated;
}

export async function approveExtension(ctx: Ctx, id: string, newDue: ISODate): Promise<Car> {
  const s = await ctx.repo.settings();
  const car = await mustCar(ctx, id);
  if (car.status !== 'Acknowledged' && car.status !== 'Evidence Submitted') throw new WorkflowError('Extensions apply to acknowledged CARs only.');
  const oldDue = effectiveDue(car);
  if (oldDue && newDue <= oldDue) throw new WorkflowError('The new due date must be after the current due date.');
  const updated = (await ctx.repo.updateCar(id, {
    extension_due: newDue, last_stage: '', remarks: remark(s, ctx, car, `Extension approved: ${oldDue ?? '-'} → ${newDue}`)
  }))!;
  await sendMail(ctx, s, updated, 'EXTENSION_APPROVED', updated.owner_email, [updated.hod_email], T.tplExtension(tctx(ctx, s), updated, newDue, oldDue));
  return updated;
}

export async function reassign(ctx: Ctx, id: string, name: string, email: string): Promise<Car> {
  const s = await ctx.repo.settings();
  const car = await mustCar(ctx, id);
  if (car.status === 'Closed' || car.status === 'Cancelled' || car.status === 'New') throw new WorkflowError(`Cannot reassign a CAR with status ${car.status}. Edit the owner instead.`);
  if (!name.trim() || !/@/.test(email)) throw new WorkflowError('New owner name and email are required.');
  const t = today(ctx, s);
  const ready: Car = {
    ...car, owner_name: name.trim(), owner_email: email.trim(), token: token(ctx),
    ack_date: null, due_date: null, extension_due: null, last_stage: '', ack_reminders: 0,
    remarks: remark(s, ctx, car, `Reassigned from ${car.owner_name} to ${name.trim()}`)
  };
  await sendMail(ctx, s, ready, 'NC_NOTICE_REASSIGNED', ready.owner_email, [], T.tplNotice(tctx(ctx, s), ready));
  const { id: _id, created_at: _c, updated_at: _u, ...patch } = ready;
  return (await ctx.repo.updateCar(id, { ...patch, status: 'Sent', sent_date: t, last_sent: t }))!;
}

export async function cancelCar(ctx: Ctx, id: string, reason: string): Promise<Car> {
  const s = await ctx.repo.settings();
  const car = await mustCar(ctx, id);
  if (car.status === 'Closed') throw new WorkflowError('A closed CAR cannot be cancelled.');
  const updated = (await ctx.repo.updateCar(id, { status: 'Cancelled', remarks: remark(s, ctx, car, `Cancelled: ${reason.trim() || '-'}`) }))!;
  await ctx.repo.log({ car_no: car.car_no ?? '', event: 'CANCELLED', to_addr: '', cc_addr: '', detail: reason, mode: s.test_mode ? 'TEST' : 'LIVE' });
  return updated;
}
