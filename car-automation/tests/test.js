// Run on macOS: /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc tests/test.js -- .   (from the car-automation folder)
const DIR = arguments[0];
let failures = 0, passes = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passes++; } else { failures++; print('FAIL: ' + msg + '\n   expected ' + e + '\n   actual   ' + a); }
}
function ok(cond, msg) { eq(!!cond, true, msg); }

// ---------- fake Google services ----------
class FakeSheet {
  constructor(name, rows) { this.name = name; this.data = rows.map(r => r.slice()); }
  width() { return Math.max(...this.data.map(r => r.length), 1); }
  getDataRange() { const w = this.width(); return { getValues: () => this.data.map(r => { const c = r.slice(); while (c.length < w) c.push(''); return c; }) }; }
  getRange(r, c) {
    const s = this;
    return {
      setValue(v) { while (s.data.length < r) s.data.push([]); const row = s.data[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; },
      getValue() { return (s.data[r - 1] || [])[c - 1]; }
    };
  }
  appendRow(a) { this.data.push(a.slice()); }
  getName() { return this.name; }
}
const sheets = {};
const ss = { getSheetByName: n => sheets[n] || null, toast() {}, getId: () => 'SSID' };
var SpreadsheetApp = { getActiveSpreadsheet: () => ss, getUi() { throw new Error('no ui'); } };
var Session = { getEffectiveUser: () => ({ getEmail: () => 'auditor@co.my' }) };
let uuid = 0;
var Utilities = { getUuid: () => 'tok-' + (++uuid) + '-x' };
const outbox = [];
var GmailApp = { sendEmail: (to, subject, text, opts) => outbox.push({ to, subject, text, cc: opts.cc || '', html: opts.htmlBody }) };
var LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
var HtmlService = { createHtmlOutput: html => ({ html, setTitle() { return this; } }) };
var ScriptApp = { getService: () => ({ getUrl: () => 'https://script.google.com/a/exec' }) };
var PropertiesService = { getScriptProperties: () => ({ getProperty: () => 'SSID', setProperty() {} }) };

['Workdays.gs', 'Setup.gs', 'Templates.gs', 'Mailer.gs', 'WebApp.gs', 'Daily.gs', 'Menu.gs'].forEach(f => load(DIR + '/' + f));

// ---------- 1. working-day maths ----------
const D = (y, m, d) => new Date(y, m - 1, d);
const H = new Set(['2026-11-09']);
eq(formatDate_(addWorkdays(D(2026, 11, 6), 1, H)), '10/11/2026', 'Fri + 1 WD skips weekend and holiday Mon 9 Nov');
eq(formatDate_(addWorkdays(D(2026, 11, 4), 14, H)), '25/11/2026', 'Ack Wed 4 Nov + 14 WD (with 9 Nov holiday) = 25 Nov');
eq(formatDate_(addWorkdays(D(2026, 11, 4), 14, new Set())), '24/11/2026', 'Without holiday = 24 Nov');
eq(formatDate_(addWorkdays(D(2026, 11, 25), -5, H)), '18/11/2026', 'Due − 5 WD = 18 Nov');
eq(workdaysBetween(D(2026, 11, 25), D(2026, 12, 4), H), 7, 'WD between 25 Nov and 4 Dec');
eq(workdaysBetween(D(2026, 12, 4), D(2026, 11, 25), H), -7, 'negative direction');
eq(isWorkday(D(2026, 11, 7), H), false, 'Saturday is not a workday');
eq(isWorkday(D(2026, 11, 9), H), false, 'holiday is not a workday');
eq(formatDate_(parseDate_('05/03/2027')), '05/03/2027', 'parse dd/mm/yyyy');
eq(parseDate_('31/02/2027'), null, 'reject invalid date');

const cfgL = { preWD: 5, r1WD: 1, r2Gap: 3, repeatGap: 3 };
const due = D(2026, 11, 25);
eq(ladderStage_(due, D(2026, 11, 17), cfgL, H), '', 'before pre');
eq(ladderStage_(due, D(2026, 11, 18), cfgL, H), 'PRE', 'Day 9 = PRE');
eq(ladderStage_(due, D(2026, 11, 25), cfgL, H), 'PRE', 'due day still PRE');
eq(ladderStage_(due, D(2026, 11, 26), cfgL, H), 'R1', 'due + 1 = R1');
eq(ladderStage_(due, D(2026, 12, 1), cfgL, H), 'R2', 'R1 + 3 WD = R2 (Tue 1 Dec)');
eq(ladderStage_(due, D(2026, 12, 3), cfgL, H), 'R2', 'still R2 before repeat');
eq(ladderStage_(due, D(2026, 12, 4), cfgL, H), 'R3#1', '3rd reminder Fri 4 Dec');
eq(ladderStage_(due, D(2026, 12, 9), cfgL, H), 'R3#2', '4th reminder Wed 9 Dec');

// ---------- 2. end-to-end stage machine ----------
const REG_HEADER = FIELDS.map(f => f[1]);
function blankRow(o) { return FIELDS.map(([k]) => (o[k] !== undefined ? o[k] : '')); }
sheets[SHEET.REGISTER] = new FakeSheet(SHEET.REGISTER, [
  REG_HEADER,
  blankRow({ area: 'Stor Buangan Terjadual', finding: 'Spill kit kosong', ref: 'SW Regs 2005, Reg. 10', severity: 'Major NC', owner: 'Ahmad', ownerEmail: 'ahmad@co.my', hod: 'En. Rosli', hodEmail: 'rosli@co.my', status: 'New' }),
  blankRow({ area: 'Line 2', finding: 'Ear plug tidak dipakai', owner: 'Siti', ownerEmail: 'siti@co.my', hod: 'Pn. Lim', hodEmail: 'lim@co.my' }),
  blankRow({ area: 'QA', finding: 'No email row', owner: 'Nobody', status: 'New' })
]);
const settingsRows = [['Setting', 'Value', 'Note']].concat(SETTINGS_DEFAULTS.map(r => r.slice()));
sheets[SHEET.SETTINGS] = new FakeSheet(SHEET.SETTINGS, settingsRows);
sheets[SHEET.HOLIDAYS] = new FakeSheet(SHEET.HOLIDAYS, [['Date', 'Holiday', 'Note'], [D(2026, 11, 9), 'Deepavali (ganti)', '']]);
sheets[SHEET.LOG] = new FakeSheet(SHEET.LOG, [LOG_HEADERS]);

setSetting_(SET.TEST, false);
setSetting_(SET.WEBAPP, 'https://script.google.com/a/exec');
setSetting_(SET.FORM, 'https://docs.google.com/forms/d/e/X/viewform?entry.1=CARNOPLACEHOLDER');
function day(y, m, d) { setSetting_(SET.SIM, D(y, m, d)); }
function reg() { return openRegister_(); }
function car(n) { return reg().rows[n]; }
function mark() { return outbox.length; }
function since(i) { return outbox.slice(i); }

// Mon 2 Nov: send new CARs
day(2026, 11, 2);
let m0 = mark();
let res = sendNewCars_(cfg_());
eq(res.sent, 2, 'two CARs sent');
eq(res.skipped.length, 1, 'row without email skipped');
eq(car(0).carNo, 'CAR-2026-11-001', 'CAR number generated');
eq(car(1).carNo, 'CAR-2026-11-002', 'second CAR number');
eq(car(0).status, 'Sent', 'status Sent');
eq(since(m0).map(e => e.to), ['ahmad@co.my', 'siti@co.my'], 'notices to owners');
ok(since(m0)[0].html.indexOf('a=ack&amp;car=CAR-2026-11-001&amp;t=tok1x') > 0, 'notice contains ack link with token');
ok(since(m0)[0].subject.indexOf('[NC] CAR-2026-11-001') === 0, 'notice subject');
eq(since(m0)[0].cc, '', 'notice has no cc');

m0 = mark(); runReminders_();
eq(since(m0).length, 0, 'no ack reminder on the send day');

// Tue 3 Nov: ack reminder, once
day(2026, 11, 3);
m0 = mark(); runReminders_(); runReminders_();
eq(since(m0).length, 2, 'one ack reminder per unacknowledged CAR, re-run does not duplicate');
eq(car(0).ackRem, 1, 'ack reminder count 1');

// Wed 4 Nov: bad token, then Ahmad acknowledges
day(2026, 11, 4);
let page = doGet({ parameter: { a: 'ack', car: 'CAR-2026-11-001', t: 'wrong' } });
ok(page.html.indexOf('Invalid link') > 0, 'invalid token rejected');
eq(car(0).status, 'Sent', 'status unchanged after bad token');
m0 = mark();
page = doGet({ parameter: { a: 'ack', car: 'CAR-2026-11-001', t: 'tok1x' } });
ok(page.html.indexOf('25/11/2026') > 0, 'ack page shows due date 25/11/2026');
eq(car(0).status, 'Acknowledged', 'status Acknowledged');
eq(formatDate_(parseDate_(car(0).due)), '25/11/2026', 'due stored');
eq(since(m0).length, 1, 'ack confirmation email');
ok(since(m0)[0].html.indexOf('entry.1=CAR-2026-11-001') > 0, 'confirmation has prefilled evidence link');
m0 = mark();
page = doGet({ parameter: { a: 'ack', car: 'CAR-2026-11-001', t: 'tok1x' } });
ok(page.html.indexOf('Already acknowledged') > 0, 'second click shows already acknowledged');
eq(since(m0).length, 0, 'second click sends nothing');

// Siti disputes
m0 = mark();
page = doPost({ parameter: { a: 'dispute', car: 'CAR-2026-11-002', t: 'tok2x', reason: 'Bukan kawasan saya – Line 3' } });
eq(car(1).status, 'Disputed', 'Siti disputed');
eq(since(m0).map(e => e.to), ['auditor@co.my'], 'dispute goes to auditor');
ok(String(car(1).remarks).indexOf('Line 3') > 0, 'dispute reason in remarks');
m0 = mark(); runReminders_();
eq(since(m0).length, 0, 'Ahmad not due yet, disputed CAR paused');

// Reassign Siti's CAR
m0 = mark();
reassign_(cfg_(), reg(), car(1), 'Kumar', 'kumar@co.my');
eq([car(1).status, car(1).ownerEmail], ['Sent', 'kumar@co.my'], 'reassigned and re-sent');
eq(since(m0).map(e => e.to), ['kumar@co.my'], 'notice to new owner');
page = doGet({ parameter: { a: 'ack', car: 'CAR-2026-11-002', t: 'tok2x' } });
ok(page.html.indexOf('Invalid link') > 0, 'old owner link no longer works');

// Ahmad's ladder
function runOn(y, mo, d) { day(y, mo, d); const i = mark(); runReminders_(); runReminders_(); return since(i).filter(e => e.to === 'ahmad@co.my'); }
eq(runOn(2026, 11, 17).length, 0, '17 Nov: nothing');
let e = runOn(2026, 11, 18);
eq(e.length, 1, '18 Nov: PRE sent once'); ok(e[0].subject.indexOf('Makluman') === 0, 'PRE subject'); eq(e[0].cc, '', 'PRE no cc');
eq(runOn(2026, 11, 25).length, 0, 'due day: nothing new');
e = runOn(2026, 11, 26);
eq(e.length, 1, '26 Nov: R1'); ok(e[0].subject.indexOf('Peringatan Pertama') === 0, 'R1 subject'); eq(e[0].cc, '', 'R1 no cc');
eq(runOn(2026, 11, 30).length, 0, '30 Nov: nothing');
e = runOn(2026, 12, 1);
eq(e.length, 1, '1 Dec: R2'); ok(e[0].subject.indexOf('[TINDAKAN SEGERA]') === 0, 'R2 subject'); eq(e[0].cc, 'rosli@co.my', 'R2 cc HOD');
e = runOn(2026, 12, 4);
eq(e.length, 1, '4 Dec: 3rd reminder'); ok(e[0].subject.indexOf('Ke-3') > 0, '3rd reminder subject'); eq(e[0].cc, 'rosli@co.my', '3rd cc HOD');
ok(e[0].html.indexOf('lewat 7 hari bekerja') > 0, '3rd reminder shows 7 working days late');
eq(runOn(2026, 12, 5).length, 0, 'Saturday: skipped');

// Evidence submitted Mon 7 Dec -> paused
day(2026, 12, 7);
m0 = mark();
handleEvidenceSubmit({ namedValues: { 'Timestamp': ['x'], 'CAR No': ['CAR-2026-11-001'], 'Punca Masalah / Root Cause': ['Tiada semakan bulanan'], 'Tindakan Pembetulan Diambil / Corrective Action Taken': ['Spill kit diisi semula'] } });
eq(car(0).status, 'Evidence Submitted', 'evidence submitted');
eq(since(m0).map(x => x.to), ['auditor@co.my'], 'auditor notified of evidence');
eq(runOn(2026, 12, 9).length, 0, '9 Dec: paused while evidence pending');

// Reject -> ladder resumes with the 4th reminder
day(2026, 12, 9);
m0 = mark();
rejectEvidence_(cfg_(), reg(), car(0), 'Tiada gambar');
eq(car(0).status, 'Acknowledged', 'back to Acknowledged');
eq(since(m0).length, 1, 'rejection email');
e = runOn(2026, 12, 9);
eq(e.length, 1, '9 Dec after reject: 4th reminder'); ok(e[0].subject.indexOf('Ke-4') > 0, '4th reminder subject');

// Extra CC on 3rd+
setSetting_(SET.EXTRA_CC, 'plant@co.my');
e = runOn(2026, 12, 14);
eq(e.length, 1, '14 Dec: 5th reminder'); eq(e[0].cc, 'rosli@co.my,plant@co.my', 'extra cc added');

// Extension resets the ladder
day(2026, 12, 14);
approveExtension_(cfg_(), reg(), car(0), D(2027, 1, 15));
eq(car(0).stage, '', 'extension resets stage');
eq(runOn(2026, 12, 15).length, 0, 'after extension: nothing until new pre date');

// Close
day(2026, 12, 16);
m0 = mark();
closeCar_(cfg_(), reg(), car(0));
eq(car(0).status, 'Closed', 'closed');
eq([since(m0)[0].to, since(m0)[0].cc], ['ahmad@co.my', 'rosli@co.my'], 'closure email to owner cc HOD');
const effDate = addWorkdays(D(2026, 12, 16), 30, readHolidays_());
day(effDate.getFullYear(), effDate.getMonth() + 1, effDate.getDate() - 1);
m0 = mark(); runReminders_();
eq(since(m0).filter(x => x.subject.indexOf('KEBERKESANAN') >= 0).length, 0, 'no effectiveness check before 30 WD');
day(effDate.getFullYear(), effDate.getMonth() + 1, effDate.getDate());
m0 = mark(); runReminders_(); runReminders_();
const eff = since(m0).filter(x => x.subject.indexOf('KEBERKESANAN') >= 0);
eq(eff.length, 1, 'effectiveness check once'); eq(eff[0].to, 'auditor@co.my', 'effectiveness to auditor');

// Test mode redirects everything
setSetting_(SET.TEST, true);
day(2027, 3, 1);
m0 = mark(); runReminders_();
ok(since(m0).length > 0, 'Kumar CAR gets an ack reminder in test mode');
ok(since(m0).every(x => x.to === 'auditor@co.my' && x.cc === '' && x.subject.indexOf('[TEST] ') === 0), 'test mode: all to auditor, no cc, [TEST] prefix');
ok(since(m0)[0].html.indexOf('kumar@co.my') > 0, 'test banner shows real recipient');

// Log
const logRows = sheets[SHEET.LOG].data.length - 1;
ok(logRows >= outbox.length, 'every email logged (' + logRows + ' log rows, ' + outbox.length + ' emails)');

print('\n' + passes + ' passed, ' + failures + ' failed');
if (failures) throw new Error('tests failed');
