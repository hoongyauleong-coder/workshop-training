/**
 * The Received / Dispute buttons in the email open this Web App.
 * Links carry the CAR No and a random per-CAR token, so they can't be guessed or forged.
 */

function doGet(e) {
  const p = (e && e.parameter) || {};
  return withLock_(() => {
    const cfg = cfg_();
    const reg = openRegister_();
    const row = findCar_(reg, p.car);
    if (!row || !p.t || String(row.token) !== String(p.t)) {
      return page_('Pautan tidak sah / Invalid link', 'This link is invalid or has expired. Sila hubungi ' + esc_(cfg.dept) + '.', COLOR.esc);
    }
    if (p.a === 'ack') return handleAck_(cfg, reg, row);
    if (p.a === 'dispute') return disputeForm_(cfg, row);
    return page_('Pautan tidak sah / Invalid link', 'Unknown action.', COLOR.esc);
  });
}

function doPost(e) {
  const p = (e && e.parameter) || {};
  return withLock_(() => {
    const cfg = cfg_();
    const reg = openRegister_();
    const row = findCar_(reg, p.car);
    if (!row || !p.t || String(row.token) !== String(p.t) || p.a !== 'dispute') {
      return page_('Pautan tidak sah / Invalid link', 'This link is invalid or has expired.', COLOR.esc);
    }
    return handleDispute_(cfg, reg, row, String(p.reason || '').trim());
  });
}

function handleAck_(cfg, reg, row) {
  if (row.status === STATUS.SENT || row.status === STATUS.DISPUTED) {
    const hol = readHolidays_();
    const ack = today_(cfg);
    const due = addWorkdays(ack, cfg.closureWD, hol);
    reg.set(row, 'ack', ack);
    reg.set(row, 'due', due);
    reg.set(row, 'status', STATUS.ACK);
    reg.set(row, 'stage', '');
    logEvent_(row.carNo, 'ACKNOWLEDGED', row.ownerEmail, '', 'Owner clicked Received', cfg.testMode);
    sendMail_(cfg, row.carNo, 'ACK_CONFIRM', row.ownerEmail, [], tplAckConfirm_(cfg, row, due));
    return page_('Penerimaan disahkan / Acknowledged ✔',
      'Terima kasih, ' + esc_(row.owner) + '. <b>' + esc_(row.carNo) + '</b> has been acknowledged.<br><br>' +
      'Tarikh akhir penutupan / Closure due date: <b>' + formatDate_(due) + '</b> (' + cfg.closureWD + ' hari bekerja).<br><br>' +
      'A confirmation email with the evidence submission link has been sent to you.', COLOR.ok);
  }
  const due = parseDate_(row.extDue) || parseDate_(row.due);
  return page_('Telah disahkan / Already acknowledged',
    '<b>' + esc_(row.carNo) + '</b> was already acknowledged' + (row.ack ? ' on ' + formatDate_(parseDate_(row.ack)) : '') + '.' +
    (due ? '<br>Tarikh akhir / Due date: <b>' + formatDate_(due) + '</b>.' : '') + '<br>Status: ' + esc_(row.status), COLOR.info);
}

function disputeForm_(cfg, row) {
  if (row.status !== STATUS.SENT && row.status !== STATUS.ACK) {
    return page_('Tidak boleh dipertikai / Cannot dispute', 'Status semasa / Current status: ' + esc_(row.status), COLOR.info);
  }
  const url = ScriptApp.getService().getUrl();
  const body =
    '<p><b>' + esc_(row.carNo) + '</b> – ' + esc_(row.finding) + '</p>' +
    '<form method="post" action="' + esc_(url) + '" target="_top">' +
    '<input type="hidden" name="a" value="dispute"><input type="hidden" name="car" value="' + esc_(row.carNo) + '">' +
    '<input type="hidden" name="t" value="' + esc_(row.token) + '">' +
    '<label style="display:block;font-weight:bold;margin:12px 0 6px">Sebab pertikaian / Reason (cth: bukan kawasan saya, nama pemilik sebenar)</label>' +
    '<textarea name="reason" required rows="5" style="width:100%;font:inherit;padding:10px;border:1px solid #ccc;border-radius:6px"></textarea>' +
    '<button type="submit" style="margin-top:12px;background:#1f4e79;color:#fff;border:0;padding:12px 22px;border-radius:6px;font-weight:bold;cursor:pointer">' +
    'Hantar / Submit</button></form>';
  return page_('Pertikaian / Dispute', body, COLOR.warn);
}

function handleDispute_(cfg, reg, row, reason) {
  if (!reason) return disputeForm_(cfg, row);
  if (row.status !== STATUS.SENT && row.status !== STATUS.ACK) {
    return page_('Tidak boleh dipertikai / Cannot dispute', 'Status semasa / Current status: ' + esc_(row.status), COLOR.info);
  }
  reg.set(row, 'status', STATUS.DISPUTED);
  appendRemark_(reg, row, cfg, 'Dispute by ' + row.owner + ': ' + reason);
  logEvent_(row.carNo, 'DISPUTED', row.ownerEmail, '', reason, cfg.testMode);
  sendMail_(cfg, row.carNo, 'DISPUTE_TO_AUDITOR', cfg.auditorEmail, [], tplDispute_(cfg, row, reason));
  return page_('Pertikaian dihantar / Dispute submitted',
    'Terima kasih. ' + esc_(cfg.auditorName) + ' will review your dispute for <b>' + esc_(row.carNo) + '</b> and contact you.', COLOR.ok);
}

function page_(title, bodyHtml, color) {
  const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
    '<body style="margin:0;background:#f5f6f3;font-family:Arial,Helvetica,sans-serif;color:#1c2321">' +
    '<div style="max-width:560px;margin:40px auto;padding:0 16px"><div style="background:#fff;border:1px solid #dde2de;border-top:5px solid ' + color +
    ';border-radius:10px;padding:24px;line-height:1.6"><h2 style="margin:0 0 12px;font-size:20px">' + esc_(title) + '</h2>' + bodyHtml +
    '</div></div></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle(title);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}
