/**
 * The "Compliance" menu, auditor actions, evidence form and triggers.
 * Menu functions are thin wrappers (UI prompts) around the *_ functions that do the work.
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Compliance')
    .addItem('📨 Hantar CAR baharu / Send new CARs', 'menuSendNewCars')
    .addItem('⏰ Jalankan peringatan sekarang / Run reminders now', 'menuRunReminders')
    .addSeparator()
    .addItem('✅ Tutup CAR dipilih / Close selected CAR', 'menuCloseCar')
    .addItem('↩️ Tolak bukti / Reject evidence', 'menuRejectEvidence')
    .addItem('📅 Lulus lanjutan / Approve extension', 'menuApproveExtension')
    .addItem('👤 Tukar pemilik / Reassign owner', 'menuReassign')
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Setup')
      .addItem('1. Bina helaian / Build sheets', 'setup')
      .addItem('2. Cipta borang bukti / Create evidence form', 'createEvidenceForm')
      .addItem('3. Pasang trigger harian / Install triggers', 'installTriggers'))
    .addToUi();
}

function ui_() {
  try { return SpreadsheetApp.getUi(); } catch (e) { return null; }
}

function toast_(msg) {
  try { ss_().toast(msg, 'Compliance', 6); } catch (e) {}
}

// ---------- send new CARs ----------

function menuSendNewCars() {
  const ui = ui_();
  const cfg = cfg_();
  if (!cfg.webAppUrl) {
    ui.alert('Web App URL belum ditetapkan', 'Deploy the Web App and paste its URL into Settings first (SETUP.md, Step 4).', ui.ButtonSet.OK);
    return;
  }
  const res = withLock_(() => sendNewCars_(cfg));
  ui.alert('Hantar CAR baharu', res.sent + ' CAR sent' + (cfg.testMode ? ' (TEST MODE – all to you)' : '') + '.' +
    (res.skipped.length ? '\n\nSkipped (missing owner email or finding):\n' + res.skipped.join('\n') : ''), ui.ButtonSet.OK);
}

function sendNewCars_(cfg) {
  const reg = openRegister_();
  const today = today_(cfg);
  const out = { sent: 0, skipped: [] };
  reg.rows.forEach(row => {
    if (row.status !== '' && row.status !== STATUS.NEW) return;
    if (!/@/.test(String(row.ownerEmail)) || !String(row.finding).trim()) {
      out.skipped.push('Row ' + row._row + (row.carNo ? ' (' + row.carNo + ')' : ''));
      return;
    }
    if (!row.carNo) reg.set(row, 'carNo', nextCarNo_(reg, cfg.prefix, today));
    if (!row.raised) reg.set(row, 'raised', today);
    reg.set(row, 'token', newToken_());
    sendMail_(cfg, row.carNo, 'NC_NOTICE', row.ownerEmail, [], tplNotice_(cfg, row));
    reg.set(row, 'status', STATUS.SENT);
    reg.set(row, 'sent', today);
    reg.set(row, 'lastSent', today);
    reg.set(row, 'ackRem', 0);
    reg.set(row, 'stage', '');
    out.sent++;
  });
  return out;
}

function nextCarNo_(reg, prefix, today) {
  const stem = prefix + '-' + today.getFullYear() + '-' + pad2_(today.getMonth() + 1) + '-';
  let max = 0;
  reg.rows.forEach(r => {
    const s = String(r.carNo);
    if (s.indexOf(stem) === 0) max = Math.max(max, Number(s.slice(stem.length)) || 0);
  });
  return stem + String(max + 1).padStart(3, '0');
}

function newToken_() { return Utilities.getUuid().replace(/-/g, ''); }

function menuRunReminders() {
  const res = runReminders_();
  const ui = ui_();
  ui.alert('Peringatan / Reminders', res.skipped
    ? 'Hari ini bukan hari bekerja (weekend / public holiday). No reminders sent.'
    : res.sent + ' reminder(s) sent' + (cfg_().testMode ? ' (TEST MODE – all to you)' : '') + '. See Email_Log.', ui.ButtonSet.OK);
}

// ---------- auditor actions on the selected row ----------

function selectedCar_() {
  const ui = ui_();
  const sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== SHEET.REGISTER) { ui.alert('Pilih satu baris dalam CAR_Register dahulu / Select a row in CAR_Register first.'); return null; }
  const r = sh.getActiveRange().getRow();
  const reg = openRegister_();
  const row = reg.rows.find(x => x._row === r);
  if (!row || !row.carNo) { ui.alert('Baris ini tiada CAR No / This row has no CAR No.'); return null; }
  return { reg: reg, row: row };
}

function menuCloseCar() {
  const sel = selectedCar_(); if (!sel) return;
  const ui = ui_();
  if (sel.row.status === STATUS.CLOSED) { ui.alert(sel.row.carNo + ' is already closed.'); return; }
  const ok = ui.alert('Tutup ' + sel.row.carNo + '?', 'Confirm you have verified the closure evidence. The owner (cc HOD) will be notified.', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  withLock_(() => closeCar_(cfg_(), sel.reg, sel.row));
  toast_(sel.row.carNo + ' closed.');
}

function closeCar_(cfg, reg, row) {
  const today = today_(cfg);
  reg.set(row, 'status', STATUS.CLOSED);
  reg.set(row, 'closed', today);
  reg.set(row, 'verifiedBy', cfg.auditorName);
  reg.set(row, 'stage', '');
  sendMail_(cfg, row.carNo, 'CLOSED', row.ownerEmail, [row.hodEmail], tplClosed_(cfg, row, today));
}

function menuRejectEvidence() {
  const sel = selectedCar_(); if (!sel) return;
  const ui = ui_();
  if (sel.row.status !== STATUS.EVIDENCE) { ui.alert(sel.row.carNo + ' has no evidence waiting (status: ' + sel.row.status + ').'); return; }
  const res = ui.prompt('Tolak bukti ' + sel.row.carNo, 'Sebab / Reason (sent to the owner):', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK || !res.getResponseText().trim()) return;
  withLock_(() => rejectEvidence_(cfg_(), sel.reg, sel.row, res.getResponseText().trim()));
  toast_('Evidence rejected – reminders resume for ' + sel.row.carNo);
}

function rejectEvidence_(cfg, reg, row, reason) {
  reg.set(row, 'status', STATUS.ACK);
  appendRemark_(reg, row, cfg, 'Evidence rejected: ' + reason);
  const due = parseDate_(row.extDue) || parseDate_(row.due);
  sendMail_(cfg, row.carNo, 'EVIDENCE_REJECTED', row.ownerEmail, [], tplEvidenceRejected_(cfg, row, reason, due));
}

function menuApproveExtension() {
  const sel = selectedCar_(); if (!sel) return;
  const ui = ui_();
  if (sel.row.status !== STATUS.ACK && sel.row.status !== STATUS.EVIDENCE) { ui.alert('Extensions apply to acknowledged CARs only.'); return; }
  const res = ui.prompt('Lanjutan ' + sel.row.carNo, 'Tarikh akhir baharu / New due date (dd/mm/yyyy):', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const d = parseDate_(res.getResponseText());
  const cur = parseDate_(sel.row.extDue) || parseDate_(sel.row.due);
  if (!d || (cur && d <= cur)) { ui.alert('Tarikh tidak sah / Invalid date. It must be after the current due date (' + formatDate_(cur) + ').'); return; }
  withLock_(() => approveExtension_(cfg_(), sel.reg, sel.row, d));
  toast_('Extension approved for ' + sel.row.carNo);
}

function approveExtension_(cfg, reg, row, newDue) {
  const oldDue = parseDate_(row.extDue) || parseDate_(row.due);
  reg.set(row, 'extDue', newDue);
  reg.set(row, 'stage', '');
  appendRemark_(reg, row, cfg, 'Extension approved: ' + formatDate_(oldDue) + ' → ' + formatDate_(newDue));
  sendMail_(cfg, row.carNo, 'EXTENSION_APPROVED', row.ownerEmail, [row.hodEmail], tplExtension_(cfg, row, newDue, oldDue));
}

function menuReassign() {
  const sel = selectedCar_(); if (!sel) return;
  const ui = ui_();
  if (sel.row.status === STATUS.CLOSED) { ui.alert(sel.row.carNo + ' is closed.'); return; }
  const n = ui.prompt('Tukar pemilik ' + sel.row.carNo, 'Nama pemilik baharu / New owner name:', ui.ButtonSet.OK_CANCEL);
  if (n.getSelectedButton() !== ui.Button.OK || !n.getResponseText().trim()) return;
  const m = ui.prompt('Tukar pemilik ' + sel.row.carNo, 'E-mel pemilik baharu / New owner email:', ui.ButtonSet.OK_CANCEL);
  if (m.getSelectedButton() !== ui.Button.OK || !/@/.test(m.getResponseText())) return;
  withLock_(() => reassign_(cfg_(), sel.reg, sel.row, n.getResponseText().trim(), m.getResponseText().trim()));
  toast_(sel.row.carNo + ' re-sent to ' + n.getResponseText().trim());
}

function reassign_(cfg, reg, row, name, email) {
  const today = today_(cfg);
  appendRemark_(reg, row, cfg, 'Reassigned from ' + row.owner + ' to ' + name);
  reg.set(row, 'owner', name);
  reg.set(row, 'ownerEmail', email);
  reg.set(row, 'token', newToken_());
  ['ack', 'due', 'extDue', 'stage'].forEach(k => reg.set(row, k, ''));
  reg.set(row, 'ackRem', 0);
  sendMail_(cfg, row.carNo, 'NC_NOTICE_REASSIGNED', email, [], tplNotice_(cfg, row));
  reg.set(row, 'status', STATUS.SENT);
  reg.set(row, 'sent', today);
  reg.set(row, 'lastSent', today);
}

// ---------- evidence form ----------

function createEvidenceForm() {
  const ss = ss_();
  const cfg = cfg_();
  const form = FormApp.create('CAR/PAR Evidence Submission – ' + cfg.dept);
  form.setDescription('Hantar bukti penutupan CAR/PAR. Submit closure evidence for your CAR/PAR. ' +
    'Bukti akan disemak oleh ' + cfg.auditorName + ' sebelum CAR ditutup.');
  const carItem = form.addTextItem().setTitle('CAR No').setRequired(true);
  form.addParagraphTextItem().setTitle('Punca Masalah / Root Cause').setRequired(true);
  form.addParagraphTextItem().setTitle('Tindakan Pembetulan Diambil / Corrective Action Taken').setRequired(true);
  form.addTextItem().setTitle('Pautan Bukti / Evidence Link').setHelpText('Google Drive link to photos, records or documents.');
  form.setConfirmationMessage('Terima kasih. Your evidence has been submitted for verification.');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  const prefilled = form.createResponse().withItemResponse(carItem.createResponse('CARNOPLACEHOLDER')).toPrefilledUrl();
  setSetting_(SET.FORM, prefilled);
  const ui = ui_();
  if (ui) ui.alert('Borang bukti dicipta / Evidence form created',
    'Form: ' + form.getEditUrl() + '\n\nOptional: open the form and add a "File upload" question for photos.\n\nNext: Compliance ▸ Setup ▸ 3. Install triggers.', ui.ButtonSet.OK);
}

/** Installable trigger: runs when the evidence Form is submitted. */
function handleEvidenceSubmit(e) {
  const nv = (e && e.namedValues) || {};
  const carKey = Object.keys(nv).find(k => /^CAR No$/i.test(k.trim()));
  if (!carKey) return; // a different form
  withLock_(() => {
    const cfg = cfg_();
    const reg = openRegister_();
    const carNo = String(nv[carKey][0] || '').trim();
    const row = findCar_(reg, carNo);
    const evidence = Object.keys(nv)
      .filter(k => k !== carKey && !/^timestamp$/i.test(k.trim()) && String(nv[k][0] || '').trim())
      .map(k => k.trim() + ': ' + nv[k].join(', ')).join('\n');
    if (!row) { logEvent_(carNo, 'EVIDENCE_UNKNOWN_CAR', '', '', evidence, cfg.testMode); return; }
    if (row.status === STATUS.CLOSED || row.status === STATUS.CANCELLED) {
      logEvent_(carNo, 'EVIDENCE_IGNORED', '', '', 'Status ' + row.status, cfg.testMode);
      return;
    }
    if (row.status === STATUS.SENT) { // submitted without clicking Received: treat as acknowledged today
      const today = today_(cfg);
      reg.set(row, 'ack', today);
      reg.set(row, 'due', addWorkdays(today, cfg.closureWD, readHolidays_()));
    }
    reg.set(row, 'evidence', evidence);
    reg.set(row, 'status', STATUS.EVIDENCE);
    logEvent_(carNo, 'EVIDENCE_SUBMITTED', row.ownerEmail, '', evidence, cfg.testMode);
    sendMail_(cfg, carNo, 'EVIDENCE_TO_AUDITOR', cfg.auditorEmail, [], tplEvidenceReceived_(cfg, row, evidence));
  });
}

// ---------- triggers ----------

function installTriggers() {
  const handlers = ['dailyRun', 'handleEvidenceSubmit'];
  ScriptApp.getProjectTriggers().forEach(t => { if (handlers.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dailyRun').timeBased().everyDays(1).atHour(8).inTimezone('Asia/Kuala_Lumpur').create();
  ScriptApp.newTrigger('handleEvidenceSubmit').forSpreadsheet(ss_()).onFormSubmit().create();
  const ui = ui_();
  if (ui) ui.alert('Trigger dipasang / Triggers installed',
    'Reminders will run every working day at about 08:00, and evidence submissions are picked up automatically.\n\n' +
    'Keep Test Mode = TRUE until you have tested the full flow (SETUP.md, Step 7).', ui.ButtonSet.OK);
}
