import { beforeEach, describe, expect, it } from 'vitest';
import { addWorkdays, fmt, isWorkday, parseDateInput, todayMY, workdaysBetween } from '@/lib/dates';
import * as E from '@/lib/engine';
import type { Car, Evidence, LogEntry, NewCar, Settings, Status } from '@/lib/types';
import { parseImport } from '@/lib/csv';

const H = new Set(['2026-11-09']);

describe('working days', () => {
  it('skips weekends and holidays', () => {
    expect(addWorkdays('2026-11-06', 1, H)).toBe('2026-11-10');
    expect(addWorkdays('2026-11-04', 14, H)).toBe('2026-11-25');
    expect(addWorkdays('2026-11-04', 14, new Set())).toBe('2026-11-24');
    expect(addWorkdays('2026-11-25', -5, H)).toBe('2026-11-18');
    expect(workdaysBetween('2026-11-25', '2026-12-04', H)).toBe(7);
    expect(workdaysBetween('2026-12-04', '2026-11-25', H)).toBe(-7);
    expect(isWorkday('2026-11-07', H)).toBe(false);
    expect(isWorkday('2026-11-09', H)).toBe(false);
  });
  it('parses and formats dates', () => {
    expect(parseDateInput('05/03/2027')).toBe('2027-03-05');
    expect(parseDateInput('2027-03-05')).toBe('2027-03-05');
    expect(parseDateInput('31/02/2027')).toBeNull();
    expect(fmt('2027-03-05')).toBe('05/03/2027');
  });
  it('takes today in Malaysia time, not UTC', () => {
    expect(todayMY(new Date('2026-11-01T17:30:00Z'))).toBe('2026-11-02'); // 01:30 MYT
  });
  it('computes the reminder ladder', () => {
    const s = { pre_wd: 5, r1_wd: 1, r2_gap: 3, repeat_gap: 3 } as Settings;
    const due = '2026-11-25';
    const at = (d: string) => E.ladderStage(due, d, s, H);
    expect([at('2026-11-17'), at('2026-11-18'), at('2026-11-25'), at('2026-11-26')]).toEqual(['', 'PRE', 'PRE', 'R1']);
    expect([at('2026-12-01'), at('2026-12-03'), at('2026-12-04'), at('2026-12-09')]).toEqual(['R2', 'R2', 'R3#1', 'R3#2']);
  });
});

// ---------- in-memory repo ----------
const defaults: Settings = {
  closure_wd: 14, pre_wd: 5, r1_wd: 1, r2_gap: 3, repeat_gap: 3, eff_wd: 30,
  auditor_name: 'HoongYau', auditor_title: 'ISO 14001 Auditor | CePSWaM', dept: 'Jabatan Pematuhan',
  auditor_email: 'auditor@co.my', extra_cc: '', car_prefix: 'CAR', test_mode: false, simulated_today: null
};

function memory() {
  const state = { settings: { ...defaults }, cars: [] as Car[], evidence: [] as Evidence[], log: [] as LogEntry[], holidays: new Set(H) };
  let id = 0;
  const repo: E.Repo = {
    settings: async () => ({ ...state.settings }),
    holidays: async () => state.holidays,
    cars: async (st?: Status[]) => state.cars.filter(c => !st || st.includes(c.status)).map(c => ({ ...c })),
    carById: async i => { const c = state.cars.find(x => x.id === i); return c ? { ...c } : null; },
    carByToken: async t => { const c = state.cars.find(x => x.token === t); return c ? { ...c } : null; },
    updateCar: async (i, patch, expect) => {
      const c = state.cars.find(x => x.id === i);
      if (!c || (expect && c.status !== expect)) return null;
      Object.assign(c, patch);
      return { ...c };
    },
    insertCars: async (rows: NewCar[]) => rows.map(r => {
      const c: Car = {
        id: `id${++id}`, car_no: r.car_no || null, date_raised: null, status: 'New', sent_date: null, ack_date: null, due_date: null,
        extension_due: null, last_stage: '', last_sent: null, ack_reminders: 0, closed_date: null, verified_by: '', remarks: '', token: null,
        area: r.area, finding: r.finding, requirement_ref: r.requirement_ref, severity: r.severity,
        owner_name: r.owner_name, owner_email: r.owner_email, hod_name: r.hod_name, hod_email: r.hod_email
      };
      state.cars.push(c);
      return { ...c };
    }),
    carNosLike: async stem => state.cars.map(c => c.car_no || '').filter(n => n.startsWith(stem)),
    log: async e => { state.log.push(e); },
    addEvidence: async e => { const ev: Evidence = { ...e, id: `ev${++id}`, decision: 'Pending', decision_reason: '', submitted_at: '' }; state.evidence.push(ev); return ev; },
    pendingEvidence: async carId => state.evidence.filter(e => e.car_id === carId && e.decision === 'Pending').pop() ?? null,
    updateEvidence: async (i, patch) => { Object.assign(state.evidence.find(e => e.id === i)!, patch); }
  };
  const outbox: E.Mail[] = [];
  let tok = 0;
  const ctx: E.Ctx = {
    repo, appUrl: 'https://car.example.com', fallbackAuditorEmail: 'fallback@co.my',
    mailer: { send: async m => { outbox.push(m); } },
    newToken: () => `tok${++tok}`.padEnd(32, '0')
  };
  return { state, ctx, outbox };
}

const base: NewCar = { area: 'Stor Buangan Terjadual', finding: 'Spill kit kosong', requirement_ref: 'SW Regs 2005, Reg. 10', severity: 'Major NC',
  owner_name: 'Ahmad', owner_email: 'ahmad@co.my', hod_name: 'En. Rosli', hod_email: 'rosli@co.my' };

describe('workflow', () => {
  let m: ReturnType<typeof memory>;
  const day = (d: string) => { m.state.settings.simulated_today = d; };
  const run = async (d: string) => {
    day(d);
    const before = m.outbox.length;
    await E.runReminders(m.ctx);
    await E.runReminders(m.ctx); // second run must not duplicate
    return m.outbox.slice(before).filter(x => x.to === 'ahmad@co.my');
  };

  beforeEach(() => { m = memory(); });

  it('runs the full lifecycle', async () => {
    const [ahmad, siti] = await E.createCars(m.ctx, [base, { ...base, owner_name: 'Siti', owner_email: 'siti@co.my', area: 'Line 2' }, { ...base, owner_email: '' }]);

    day('2026-11-02');
    const res = await E.sendNewCars(m.ctx);
    expect(res).toEqual({ sent: 2, skipped: ['Spill kit kosong'] });
    let a = (await m.ctx.repo.carById(ahmad.id))!;
    expect([a.car_no, a.status, a.sent_date]).toEqual(['CAR-2026-11-001', 'Sent', '2026-11-02']);
    expect(m.outbox[0].subject).toMatch(/^\[NC\] CAR-2026-11-001/);
    expect(m.outbox[0].html).toContain(`https://car.example.com/o/${a.token}?do=ack`);
    expect(m.outbox[0].cc).toBeUndefined();

    expect(await run('2026-11-02')).toHaveLength(0);
    const r = await run('2026-11-03');
    expect(r).toHaveLength(1);
    expect(r[0].subject).toContain('Pengesahan Penerimaan');

    // acknowledge
    day('2026-11-04');
    await expect(E.acknowledge(m.ctx, 'nope')).rejects.toThrow('invalid');
    const ack = await E.acknowledge(m.ctx, a.token!);
    expect([ack.already, ack.car.status, ack.car.due_date]).toEqual([false, 'Acknowledged', '2026-11-25']);
    expect((await E.acknowledge(m.ctx, a.token!)).already).toBe(true);
    expect(m.outbox.filter(x => x.subject.includes('Penerimaan Disahkan'))).toHaveLength(1);

    // Siti disputes, gets reassigned; old link dies
    const s0 = (await m.ctx.repo.carById(siti.id))!;
    await E.dispute(m.ctx, s0.token!, 'Bukan kawasan saya – Line 3');
    expect(m.outbox.at(-1)!.to).toBe('auditor@co.my');
    const re = await E.reassign(m.ctx, siti.id, 'Kumar', 'kumar@co.my');
    expect([re.status, re.owner_email]).toEqual(['Sent', 'kumar@co.my']);
    await expect(E.acknowledge(m.ctx, s0.token!)).rejects.toThrow('invalid');

    // ladder
    expect(await run('2026-11-17')).toHaveLength(0);
    let e = await run('2026-11-18');
    expect(e.map(x => x.subject)).toEqual([expect.stringMatching(/^Makluman/)]);
    expect(await run('2026-11-25')).toHaveLength(0);
    e = await run('2026-11-26');
    expect([e.length, e[0].subject.startsWith('Peringatan Pertama'), e[0].cc]).toEqual([1, true, undefined]);
    e = await run('2026-12-01');
    expect([e.length, e[0].subject.startsWith('[TINDAKAN SEGERA]'), e[0].cc]).toEqual([1, true, 'rosli@co.my']);
    e = await run('2026-12-04');
    expect([e.length, e[0].subject.includes('Ke-3'), e[0].cc]).toEqual([1, true, 'rosli@co.my']);
    expect(e[0].html).toContain('lewat 7 hari bekerja');
    expect(await run('2026-12-05')).toHaveLength(0); // Saturday

    // evidence pauses, reject resumes
    day('2026-12-07');
    a = (await m.ctx.repo.carById(ahmad.id))!;
    await expect(E.submitEvidence(m.ctx, a.token!, { rootCause: 'x', actionTaken: 'y', files: [{ path: 'other/f.jpg', name: 'f', type: 'image/jpeg', size: 1 }] }))
      .rejects.toThrow('Invalid file');
    await E.submitEvidence(m.ctx, a.token!, { rootCause: 'Tiada semakan bulanan', actionTaken: 'Spill kit diisi semula',
      files: [{ path: `${ahmad.id}/1.jpg`, name: '1.jpg', type: 'image/jpeg', size: 1000 }] });
    expect(m.outbox.at(-1)!.to).toBe('auditor@co.my');
    expect(await run('2026-12-09')).toHaveLength(0);
    day('2026-12-09');
    await E.rejectEvidence(m.ctx, ahmad.id, 'Tiada gambar selepas');
    expect(m.state.evidence[0].decision).toBe('Rejected');
    e = await run('2026-12-09');
    expect(e[0].subject).toContain('Ke-4');

    m.state.settings.extra_cc = 'plant@co.my';
    e = await run('2026-12-14');
    expect(e[0].cc).toBe('rosli@co.my,plant@co.my');

    // extension restarts the ladder
    day('2026-12-14');
    await expect(E.approveExtension(m.ctx, ahmad.id, '2026-11-01')).rejects.toThrow('after');
    await E.approveExtension(m.ctx, ahmad.id, '2027-01-15');
    expect(await run('2026-12-15')).toHaveLength(0);

    // close + effectiveness
    day('2026-12-16');
    const closed = await E.closeCar(m.ctx, ahmad.id);
    expect(closed.status).toBe('Closed');
    expect([m.outbox.at(-1)!.to, m.outbox.at(-1)!.cc]).toEqual(['ahmad@co.my', 'rosli@co.my']);
    const effDay = addWorkdays('2026-12-16', 30, H);
    day(addWorkdays(effDay, -1, H));
    let n = m.outbox.length;
    await E.runReminders(m.ctx);
    expect(m.outbox.slice(n).filter(x => x.subject.includes('KEBERKESANAN'))).toHaveLength(0);
    day(effDay);
    n = m.outbox.length;
    await E.runReminders(m.ctx);
    await E.runReminders(m.ctx);
    const eff = m.outbox.slice(n).filter(x => x.subject.includes('KEBERKESANAN'));
    expect(eff.map(x => x.to)).toEqual(['auditor@co.my']);

    // every email logged
    expect(m.state.log.filter(l => !['ACKNOWLEDGED', 'DISPUTED', 'EVIDENCE_SUBMITTED', 'ERROR'].includes(l.event)).length).toBe(m.outbox.length);
  });

  it('test mode sends everything to the auditor only', async () => {
    m.state.settings.test_mode = true;
    m.state.settings.auditor_email = '';
    await E.createCars(m.ctx, [base]);
    day('2026-11-02');
    await E.sendNewCars(m.ctx);
    const mail = m.outbox[0];
    expect([mail.to, mail.cc, mail.subject.startsWith('[TEST] ')]).toEqual(['fallback@co.my', undefined, true]);
    expect(mail.html).toContain('ahmad@co.my');
    expect(m.state.log[0]).toMatchObject({ to_addr: 'ahmad@co.my', mode: 'TEST' });
  });

  it('rejects actions in the wrong state', async () => {
    const [c] = await E.createCars(m.ctx, [base]);
    await expect(E.closeCar(m.ctx, c.id)).rejects.toThrow('New');
    day('2026-11-02');
    await E.sendCar(m.ctx, c.id);
    await expect(E.sendCar(m.ctx, c.id)).rejects.toThrow('already been sent');
    await expect(E.rejectEvidence(m.ctx, c.id, 'x')).rejects.toThrow('no evidence');
  });
});

describe('import', () => {
  it('reads Excel paste with BM headers', () => {
    const { rows, errors } = parseImport('Kawasan\tPenemuan\tRujukan\tTahap\tNama\tEmel\tPengurus\tEmel Pengurus\nStor SW\tDrum tanpa label\tReg. 8\tMajor NC\tAhmad\tahmad@co.my\tEn. Rosli\trosli@co.my');
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ area: 'Stor SW', finding: 'Drum tanpa label', owner_email: 'ahmad@co.my', hod_name: 'En. Rosli', hod_email: 'rosli@co.my' });
  });
  it('reads the walkthrough skill CSV', () => {
    const csv = 'Finding No.,Area,Description,Requirement,Reference,Severity,Corrective Action Required,PIC,Due Date\n' +
      'F-01,Stor Buangan Terjadual,"Drum tanpa label, 8 Okt",All containers labelled,"SW Regs 2005, Reg. 8",Major NC,Label drum,Ahmad,15 Okt 2026';
    const { rows } = parseImport(csv);
    expect(rows[0]).toMatchObject({ area: 'Stor Buangan Terjadual', finding: 'Drum tanpa label, 8 Okt', requirement_ref: 'SW Regs 2005, Reg. 8', owner_name: 'Ahmad', owner_email: '' });
  });
});
