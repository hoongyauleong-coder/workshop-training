import { supabaseRepo } from '@/lib/repo';
import { adminClient } from '@/lib/supabase/admin';
import { fmt } from '@/lib/dates';
import { addAuditor, addHoliday, changePassword, deleteHoliday, removeAuditor, saveSettings } from '../actions';
import { Banner } from '../ui';

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const s = await supabaseRepo().settings();
  const db = adminClient();
  const [{ data: holidays }, { data: auditors }] = await Promise.all([
    db.from('holidays').select('*').order('date'),
    db.from('auditors').select('*').order('email')
  ]);
  const num = (name: keyof typeof s, label: string, hint: string) => (
    <label>{label}<input name={name} type="number" min={0} defaultValue={String(s[name])} required /><span className="small" style={{ fontWeight: 400 }}>{hint}</span></label>
  );
  return (
    <>
      <div className="head"><h1>Settings</h1></div>
      <Banner ok={sp.ok} err={sp.err} />

      <form action={saveSettings}>
        <div className="panel">
          <h2>Mod / Mode</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            <label className="check"><input type="checkbox" name="test_mode" defaultChecked={s.test_mode} /> TEST MODE: every email goes to the auditor email only, with [TEST] in the subject</label>
            <label style={{ maxWidth: 320 }}>Simulated today (testing only, leave BLANK in real use)
              <input name="simulated_today" type="date" defaultValue={s.simulated_today ?? ''} />
            </label>
          </div>
        </div>
        <div className="panel">
          <h2>Jadual peringatan / Reminder schedule (working days)</h2>
          <div className="fields">
            {num('closure_wd', 'Closure period', 'Starts when the owner clicks Received')}
            {num('pre_wd', 'Pre-deadline reminder', 'Working days before due (0 = off)')}
            {num('r1_wd', '1st reminder', 'Working days after due')}
            {num('r2_gap', '2nd reminder (cc HOD)', 'Working days after the 1st')}
            {num('repeat_gap', '3rd+ reminder interval (cc HOD)', 'Repeats until closed')}
            {num('eff_wd', 'Effectiveness check', 'Working days after closure (0 = off)')}
          </div>
        </div>
        <div className="panel">
          <h2>Tandatangan & e-mel / Signature & email</h2>
          <div className="fields">
            <label>Auditor name<input name="auditor_name" defaultValue={s.auditor_name} required /></label>
            <label>Title<input name="auditor_title" defaultValue={s.auditor_title} /></label>
            <label>Department<input name="dept" defaultValue={s.dept} required /></label>
            <label>Auditor email (disputes, evidence, test mode)<input name="auditor_email" type="email" defaultValue={s.auditor_email} placeholder="Blank = the Gmail sending account" /></label>
            <label>Extra CC on 3rd+ reminder<input name="extra_cc" defaultValue={s.extra_cc} placeholder="plant.manager@company.com" /></label>
            <label>CAR No prefix<input name="car_prefix" defaultValue={s.car_prefix} /></label>
          </div>
        </div>
        <div style={{ marginBottom: 24 }}><button className="primary" type="submit">Simpan settings / Save</button></div>
      </form>

      <div className="grid2">
        <div className="panel">
          <h2>Cuti umum / Public holidays</h2>
          <p className="muted small">Malaysia + Penang. Rows marked SAHKAN are estimates: check them against the official list and add next year&apos;s every December.</p>
          <form action={addHoliday} className="fields" style={{ marginBottom: 14, alignItems: 'end' }}>
            <label>Date<input name="date" type="date" required /></label>
            <label>Name<input name="name" required /></label>
            <label>Note<input name="note" /></label>
            <div><button type="submit">Tambah / Add</button></div>
          </form>
          <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="list">
              <tbody>
                {(holidays ?? []).map(h => (
                  <tr key={h.date}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmt(h.date)}</td>
                    <td>{h.name}<div className="muted small">{h.note}</div></td>
                    <td><form action={deleteHoliday.bind(null, h.date)}><button className="small danger" type="submit">✕</button></form></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="panel">
            <h2>Auditors</h2>
            <ul className="timeline" style={{ marginBottom: 14 }}>
              {(auditors ?? []).map(a => (
                <li key={a.email} className="row between">
                  <span>{a.name} <span className="muted">{a.email}</span></span>
                  <form action={removeAuditor.bind(null, a.email)}><button className="small danger" type="submit">Remove</button></form>
                </li>
              ))}
            </ul>
            <form action={addAuditor} style={{ display: 'grid', gap: 10 }}>
              <div className="fields">
                <label>Name<input name="name" required /></label>
                <label>Email<input name="email" type="email" required /></label>
                <label>Temporary password<input name="password" type="text" minLength={10} required autoComplete="off" /></label>
              </div>
              <div><button type="submit">Tambah auditor / Add auditor</button></div>
            </form>
          </div>
          <div className="panel">
            <h2>Tukar kata laluan / Change my password</h2>
            <form action={changePassword} style={{ display: 'grid', gap: 10 }}>
              <div className="fields">
                <label>New password<input name="password" type="password" minLength={10} required autoComplete="new-password" /></label>
                <label>Confirm<input name="confirm" type="password" minLength={10} required autoComplete="new-password" /></label>
              </div>
              <div><button type="submit">Change password</button></div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
