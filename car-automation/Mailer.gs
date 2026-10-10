/**
 * Sends one email and records it in Email_Log.
 * In Test Mode every email goes to the auditor only, with a banner showing the real recipients.
 */
function sendMail_(cfg, carNo, event, to, ccList, tpl) {
  const cc = (ccList || []).map(s => String(s || '').trim()).filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i && v !== to).join(',');
  let sendTo = to, sendCc = cc, subject = tpl.subject, html = tpl.html;
  if (cfg.testMode) {
    html = '<div style="font-family:Arial,sans-serif;background:#fbf3d6;color:#8a6d00;padding:10px 14px;border-radius:6px;margin-bottom:16px;font-size:13px">' +
      '<b>TEST MODE</b> – in live mode this email goes to: <b>' + esc_(to) + '</b>' + (cc ? ' &nbsp;cc: <b>' + esc_(cc) + '</b>' : '') + '</div>' + html;
    subject = '[TEST] ' + subject;
    sendTo = cfg.auditorEmail;
    sendCc = '';
  }
  if (!sendTo) throw new Error('No recipient for ' + event + ' on ' + carNo);
  const opts = { htmlBody: html, name: cfg.auditorName + ' – ' + cfg.dept };
  if (sendCc) opts.cc = sendCc;
  if (cfg.auditorEmail) opts.replyTo = cfg.auditorEmail;
  GmailApp.sendEmail(sendTo, subject, htmlToText_(html), opts);
  logEvent_(carNo, event, to, cc, subject, cfg.testMode);
}

function htmlToText_(html) {
  return html
    .replace(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g, '$2: $1')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/(p|div|tr)>/g, '\n')
    .replace(/<\/td>/g, '  ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
