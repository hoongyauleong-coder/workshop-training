/**
 * Sheet layout, settings, data access and the one-time setup().
 */

const SHEET = {
  REGISTER: 'CAR_Register',
  SETTINGS: 'Settings',
  HOLIDAYS: 'Holidays',
  LOG: 'Email_Log',
  DASHBOARD: 'Dashboard'
};

// [key, header]. The register is read by header name, so columns can be moved.
const FIELDS = [
  ['carNo', 'CAR No'],
  ['raised', 'Date Raised'],
  ['area', 'Area/Dept'],
  ['finding', 'Finding'],
  ['ref', 'Requirement/Ref'],
  ['severity', 'Severity'],
  ['owner', 'Owner Name'],
  ['ownerEmail', 'Owner Email'],
  ['hod', 'HOD Name'],
  ['hodEmail', 'HOD Email'],
  ['status', 'Status'],
  ['sent', 'Sent Date'],
  ['ack', 'Ack Date'],
  ['due', 'Due Date'],
  ['extDue', 'Extension Due'],
  ['stage', 'Last Stage'],
  ['lastSent', 'Last Sent'],
  ['ackRem', 'Ack Reminders'],
  ['evidence', 'Evidence'],
  ['closed', 'Closed Date'],
  ['verifiedBy', 'Verified By'],
  ['remarks', 'Remarks'],
  ['token', 'Token']
];

const STATUS = {
  NEW: 'New',
  SENT: 'Sent',
  ACK: 'Acknowledged',
  EVIDENCE: 'Evidence Submitted',
  DISPUTED: 'Disputed',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled'
};

const SET = {
  CLOSURE: 'Closure period (working days)',
  PRE: 'Pre-deadline reminder (working days before due)',
  R1: '1st reminder (working days after due)',
  R2: '2nd reminder (working days after 1st) – cc HOD',
  REPEAT: '3rd+ reminder interval (working days) – cc HOD',
  EFFECT: 'Effectiveness check (working days after closure)',
  NAME: 'Auditor name',
  TITLE: 'Auditor title',
  DEPT: 'Department',
  EMAIL: 'Auditor email',
  EXTRA_CC: 'Extra CC on 3rd+ reminder',
  WEBAPP: 'Web App URL',
  FORM: 'Evidence Form URL',
  TEST: 'Test Mode',
  SIM: 'Simulated Today',
  PREFIX: 'CAR No prefix'
};

// [key, default, note]
const SETTINGS_DEFAULTS = [
  [SET.CLOSURE, 14, 'Clock starts when the owner clicks Received'],
  [SET.PRE, 5, 'Friendly reminder before the deadline'],
  [SET.R1, 1, 'Firm reminder'],
  [SET.R2, 3, 'HOD is copied from this reminder onwards'],
  [SET.REPEAT, 3, 'Keeps repeating until the CAR is Closed'],
  [SET.EFFECT, 30, 'Reminder to the auditor only (ISO 14001 cl. 10.2)'],
  [SET.NAME, 'HoongYau', ''],
  [SET.TITLE, 'ISO 14001 Auditor | CePSWaM', ''],
  [SET.DEPT, 'Jabatan Pematuhan', ''],
  [SET.EMAIL, '', 'Blank = your Google account email'],
  [SET.EXTRA_CC, '', 'e.g. Plant Manager email. Leave blank if not needed'],
  [SET.WEBAPP, '', 'Paste after Deploy ▸ New deployment ▸ Web app'],
  [SET.FORM, '', 'Filled automatically by Compliance ▸ Setup: Create evidence form'],
  [SET.TEST, true, 'TRUE = every email goes to you only, subject starts with [TEST]'],
  [SET.SIM, '', 'For testing only: pretend today is this date. Leave BLANK in real use'],
  [SET.PREFIX, 'CAR', 'CAR numbers look like CAR-2026-10-001']
];

const LOG_HEADERS = ['Timestamp', 'CAR No', 'Event', 'To', 'CC', 'Subject / Detail', 'Mode'];

// ---------- data access ----------

function ss_() {
  let ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
  if (ss) return ss;
  const id = PropertiesService.getScriptProperties().getProperty('SS_ID');
  return SpreadsheetApp.openById(id);
}

function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" not found. Run Compliance ▸ Setup: Build sheets first.');
  return sh;
}

/** Reads the register into row objects. reg.set(row, key, value) writes one cell back. */
function openRegister_() {
  const sh = sheet_(SHEET.REGISTER);
  const values = sh.getDataRange().getValues();
  const header = (values[0] || []).map(h => String(h).trim());
  const idx = {};
  FIELDS.forEach(([key, title]) => { idx[key] = header.indexOf(title); });
  const missing = FIELDS.filter(([key]) => idx[key] < 0).map(f => f[1]);
  if (missing.length) throw new Error('CAR_Register is missing column(s): ' + missing.join(', '));

  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    if (!v.some(c => c !== '' && c !== null)) continue;
    const row = { _row: i + 1 };
    FIELDS.forEach(([key]) => { row[key] = v[idx[key]] === undefined ? '' : v[idx[key]]; });
    rows.push(row);
  }
  return {
    sheet: sh,
    rows: rows,
    set(row, key, value) {
      sh.getRange(row._row, idx[key] + 1).setValue(value);
      row[key] = value;
    }
  };
}

function findCar_(reg, carNo) {
  const want = String(carNo || '').trim();
  return want ? reg.rows.find(r => String(r.carNo).trim() === want) || null : null;
}

function readSettings_() {
  const values = sheet_(SHEET.SETTINGS).getDataRange().getValues();
  const out = {};
  values.slice(1).forEach(r => { if (r[0] !== '') out[String(r[0]).trim()] = r[1]; });
  return out;
}

function cfg_() {
  const s = readSettings_();
  const num = (k, d) => {
    const n = Number(s[k]);
    return s[k] !== '' && isFinite(n) && n >= 0 ? n : d;
  };
  let email = String(s[SET.EMAIL] || '').trim();
  if (!email) {
    try { email = Session.getEffectiveUser().getEmail(); } catch (e) {}
  }
  return {
    closureWD: num(SET.CLOSURE, 14),
    preWD: num(SET.PRE, 5),
    r1WD: Math.max(1, num(SET.R1, 1)),
    r2Gap: Math.max(1, num(SET.R2, 3)),
    repeatGap: Math.max(1, num(SET.REPEAT, 3)),
    effWD: num(SET.EFFECT, 30),
    auditorName: String(s[SET.NAME] || 'HoongYau'),
    auditorTitle: String(s[SET.TITLE] || ''),
    dept: String(s[SET.DEPT] || 'Jabatan Pematuhan'),
    auditorEmail: email,
    extraCc: String(s[SET.EXTRA_CC] || '').trim(),
    webAppUrl: String(s[SET.WEBAPP] || '').trim(),
    formUrl: String(s[SET.FORM] || '').trim(),
    testMode: s[SET.TEST] === true || String(s[SET.TEST]).toUpperCase() === 'TRUE',
    simToday: parseDate_(s[SET.SIM]),
    prefix: String(s[SET.PREFIX] || 'CAR').trim()
  };
}

function today_(cfg) { return startOfDay_(cfg.simToday || new Date()); }

function readHolidays_() {
  const set = new Set();
  const sh = ss_().getSheetByName(SHEET.HOLIDAYS);
  if (!sh) return set;
  sh.getDataRange().getValues().slice(1).forEach(r => {
    const d = parseDate_(r[0]);
    if (d) set.add(dateKey_(d));
  });
  return set;
}

function logEvent_(carNo, event, to, cc, detail, testMode) {
  sheet_(SHEET.LOG).appendRow([new Date(), carNo || '', event, to || '', cc || '', detail || '', testMode ? 'TEST' : 'LIVE']);
}

function appendRemark_(reg, row, cfg, text) {
  const line = '[' + formatDate_(today_(cfg)) + '] ' + text;
  reg.set(row, 'remarks', row.remarks ? row.remarks + '\n' + line : line);
}

function setSetting_(key, value) {
  const sh = sheet_(SHEET.SETTINGS);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === key) { sh.getRange(i + 1, 2).setValue(value); return; }
  }
  sh.appendRow([key, value, '']);
}

// ---------- one-time setup ----------

function colLetter_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function setup() {
  const ss = ss_();
  ss.setSpreadsheetTimeZone('Asia/Kuala_Lumpur');
  PropertiesService.getScriptProperties().setProperty('SS_ID', ss.getId());

  // CAR_Register
  let reg = ss.getSheetByName(SHEET.REGISTER);
  if (!reg) reg = ss.insertSheet(SHEET.REGISTER, 0);
  if (reg.getLastRow() === 0) {
    reg.getRange(1, 1, 1, FIELDS.length).setValues([FIELDS.map(f => f[1])]);
  }
  const L = {};
  FIELDS.forEach(([key], i) => { L[key] = colLetter_(i + 1); });
  const col = key => FIELDS.findIndex(f => f[0] === key) + 1;
  reg.setFrozenRows(1);
  reg.getRange(1, 1, 1, FIELDS.length).setFontWeight('bold').setBackground('#1f4e79').setFontColor('#ffffff').setWrap(true);
  ['raised', 'sent', 'ack', 'due', 'extDue', 'lastSent', 'closed'].forEach(k => reg.getRange(2, col(k), 999, 1).setNumberFormat('dd/mm/yyyy'));
  reg.getRange(2, col('status'), 999, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(Object.values(STATUS), true).setAllowInvalid(false).build());
  reg.getRange(2, col('severity'), 999, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Major NC', 'Minor NC', 'Observation'], true).setAllowInvalid(true).build());
  reg.setColumnWidth(col('finding'), 320);
  reg.setColumnWidth(col('remarks'), 260);
  reg.setColumnWidth(col('evidence'), 260);
  reg.hideColumns(col('token'));
  const effDue = 'IF($' + L.extDue + '2<>"",$' + L.extDue + '2,$' + L.due + '2)';
  const rules = [
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($' + L.status + '2="' + STATUS.ACK + '",' + effDue + '<>"",' + effDue + '<TODAY())')
      .setBackground('#fbe4e2').setRanges([reg.getRange('A2:' + colLetter_(FIELDS.length) + '1000')]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$' + L.status + '2="' + STATUS.CLOSED + '"')
      .setBackground('#e4f1e8').setRanges([reg.getRange('A2:' + colLetter_(FIELDS.length) + '1000')]).build()
  ];
  reg.setConditionalFormatRules(rules);

  // Settings (only adds missing keys; never overwrites your values)
  let st = ss.getSheetByName(SHEET.SETTINGS);
  if (!st) st = ss.insertSheet(SHEET.SETTINGS);
  if (st.getLastRow() === 0) st.appendRow(['Setting', 'Value', 'Note']);
  const have = new Set(st.getDataRange().getValues().map(r => String(r[0]).trim()));
  SETTINGS_DEFAULTS.forEach(([k, v, note]) => { if (!have.has(k)) st.appendRow([k, v, note]); });
  st.getRange(1, 1, 1, 3).setFontWeight('bold');
  st.setColumnWidth(1, 340); st.setColumnWidth(2, 320); st.setColumnWidth(3, 420);

  // Holidays
  let hol = ss.getSheetByName(SHEET.HOLIDAYS);
  if (!hol) {
    hol = ss.insertSheet(SHEET.HOLIDAYS);
    hol.appendRow(['Date', 'Holiday', 'Note']);
    HOLIDAY_SEED.forEach(h => hol.appendRow([parseDate_(h[0]), h[1], h[2]]));
    hol.getRange(2, 1, 200, 1).setNumberFormat('dd/mm/yyyy');
    hol.getRange(1, 1, 1, 3).setFontWeight('bold');
    hol.setColumnWidth(2, 300); hol.setColumnWidth(3, 320);
  }

  // Email_Log
  let log = ss.getSheetByName(SHEET.LOG);
  if (!log) {
    log = ss.insertSheet(SHEET.LOG);
    log.appendRow(LOG_HEADERS);
    log.getRange(1, 1, 1, LOG_HEADERS.length).setFontWeight('bold');
    log.setFrozenRows(1);
    log.getRange('A:A').setNumberFormat('dd/mm/yyyy hh:mm');
  }

  // Dashboard
  let db = ss.getSheetByName(SHEET.DASHBOARD);
  if (!db) db = ss.insertSheet(SHEET.DASHBOARD, 1);
  db.clear();
  const R = "'" + SHEET.REGISTER + "'!";
  const S = R + L.status + '2:' + L.status;
  const due = R + L.due + '2:' + L.due, ext = R + L.extDue + '2:' + L.extDue, closed = R + L.closed + '2:' + L.closed;
  const eff = 'IF(' + ext + '<>"",' + ext + ',' + due + ')';
  const rows = [
    ['CAR/PAR Dashboard', ''],
    ['', ''],
    ['Menunggu pengesahan / Awaiting acknowledgement', '=COUNTIF(' + S + ',"' + STATUS.SENT + '")'],
    ['Dalam tindakan / Open (acknowledged)', '=COUNTIF(' + S + ',"' + STATUS.ACK + '")'],
    ['Lewat / Overdue', '=SUMPRODUCT((' + S + '="' + STATUS.ACK + '")*(' + eff + '<>"")*(' + eff + '<TODAY()))'],
    ['Bukti untuk disemak / Evidence to verify', '=COUNTIF(' + S + ',"' + STATUS.EVIDENCE + '")'],
    ['Dipertikai / Disputed', '=COUNTIF(' + S + ',"' + STATUS.DISPUTED + '")'],
    ['Ditutup / Closed', '=COUNTIF(' + S + ',"' + STATUS.CLOSED + '")'],
    ['Ditutup tepat masa / Closed on time %', '=IFERROR(SUMPRODUCT((' + S + '="' + STATUS.CLOSED + '")*(' + closed + '<=' + eff + '))/COUNTIF(' + S + ',"' + STATUS.CLOSED + '"),"-")'],
    ['', ''],
    ['Belum ditutup mengikut jabatan / Open by department', '']
  ];
  db.getRange(1, 1, rows.length, 2).setValues(rows);
  db.getRange(rows.length + 1, 1).setFormula(
    '=IFERROR(QUERY(' + R + 'A1:' + colLetter_(FIELDS.length) + ',"select ' + L.area + ', count(' + L.carNo + ') where ' + L.carNo +
    " is not null and " + L.status + " <> '" + STATUS.CLOSED + "' and " + L.status + " <> '" + STATUS.CANCELLED +
    "' group by " + L.area + " label " + L.area + " 'Area/Dept', count(" + L.carNo + ") 'Open'\",1),\"Tiada / None\")");
  db.getRange('A1').setFontSize(16).setFontWeight('bold');
  db.getRange('A11').setFontWeight('bold');
  db.getRange('B9').setNumberFormat('0%');
  db.setColumnWidth(1, 380);

  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);

  const ui = ui_();
  if (ui) ui.alert('Setup selesai / Setup complete',
    'Sheets are ready. Next: deploy the Web App and paste its URL into Settings (see SETUP.md, Step 4).', ui.ButtonSet.OK);
}

// Malaysia (federal) + Penang. Lunar dates are ESTIMATES – verify against the official gazette every year.
const HOLIDAY_SEED = [
  ['2026-11-08', 'Deepavali', 'Anggaran / estimate – SAHKAN'],
  ['2026-11-09', 'Cuti ganti Deepavali (replacement)', 'Anggaran / estimate – SAHKAN'],
  ['2026-12-25', 'Hari Krismas / Christmas', 'Tarikh tetap / fixed'],
  ['2027-01-01', 'Tahun Baru / New Year', 'Tarikh tetap / fixed'],
  ['2027-01-22', 'Thaipusam', 'Anggaran / estimate – SAHKAN'],
  ['2027-02-06', 'Tahun Baru Cina / Chinese New Year', 'Anggaran / estimate – SAHKAN'],
  ['2027-02-07', 'Tahun Baru Cina (Hari Kedua)', 'Anggaran / estimate – SAHKAN'],
  ['2027-02-08', 'Cuti ganti Tahun Baru Cina (replacement)', 'Anggaran / estimate – SAHKAN'],
  ['2027-02-24', 'Nuzul Al-Quran', 'Anggaran / estimate – SAHKAN'],
  ['2027-03-10', 'Hari Raya Aidilfitri', 'Anggaran / estimate – SAHKAN'],
  ['2027-03-11', 'Hari Raya Aidilfitri (Hari Kedua)', 'Anggaran / estimate – SAHKAN'],
  ['2027-05-01', 'Hari Pekerja / Labour Day', 'Tarikh tetap / fixed'],
  ['2027-05-17', 'Hari Raya Haji', 'Anggaran / estimate – SAHKAN'],
  ['2027-05-20', 'Hari Wesak', 'Anggaran / estimate – SAHKAN'],
  ['2027-06-06', 'Awal Muharram', 'Anggaran / estimate – SAHKAN'],
  ['2027-06-07', 'Hari Keputeraan YDP Agong', 'Isnin pertama Jun / first Monday of June'],
  ['2027-06-08', 'Cuti ganti Awal Muharram (replacement)', 'Anggaran / estimate – SAHKAN'],
  ['2027-07-07', 'Hari Bandaraya Warisan Dunia George Town', 'Tarikh tetap / fixed (Penang)'],
  ['2027-07-10', 'Hari Jadi Yang Dipertua Negeri Pulau Pinang', 'Sabtu kedua Julai / 2nd Saturday of July'],
  ['2027-08-15', 'Maulidur Rasul', 'Anggaran / estimate – SAHKAN'],
  ['2027-08-16', 'Cuti ganti Maulidur Rasul (replacement)', 'Anggaran / estimate – SAHKAN'],
  ['2027-08-31', 'Hari Kebangsaan / National Day', 'Tarikh tetap / fixed'],
  ['2027-09-16', 'Hari Malaysia / Malaysia Day', 'Tarikh tetap / fixed'],
  ['2027-10-29', 'Deepavali', 'Anggaran / estimate – SAHKAN'],
  ['2027-12-25', 'Hari Krismas / Christmas', 'Tarikh tetap / fixed']
];
