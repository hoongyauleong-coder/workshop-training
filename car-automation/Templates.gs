/**
 * Email templates – firm and formal, mixed BM + English (ECOM style).
 * Each template returns { subject, html }.
 */

const COLOR = { info: '#1f4e79', ok: '#2f7d4f', warn: '#8a6d00', firm: '#c2571a', esc: '#b42318' };

function esc_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function links_(cfg, row) {
  const base = cfg.webAppUrl;
  const q = 'car=' + encodeURIComponent(row.carNo) + '&t=' + encodeURIComponent(row.token);
  return {
    ack: base ? base + '?a=ack&' + q : '',
    dispute: base ? base + '?a=dispute&' + q : '',
    evidence: cfg.formUrl ? cfg.formUrl.replace('CARNOPLACEHOLDER', encodeURIComponent(row.carNo)) : ''
  };
}

function carTable_(row, extra) {
  const rows = [
    ['CAR No', row.carNo],
    ['Kawasan / Area', row.area],
    ['Penemuan / Finding', row.finding],
    ['Rujukan / Requirement', row.ref],
    ['Tahap / Severity', row.severity]
  ].concat(extra || []).filter(r => r[1] !== '' && r[1] !== null && r[1] !== undefined);
  return '<table style="border-collapse:collapse;width:100%;margin:8px 0 4px;font-size:14px">' +
    rows.map(r =>
      '<tr><td style="padding:8px 10px;border:1px solid #dde2de;background:#f5f6f3;width:34%;font-weight:bold;vertical-align:top">' +
      esc_(r[0]) + '</td><td style="padding:8px 10px;border:1px solid #dde2de;vertical-align:top">' + esc_(r[1]) + '</td></tr>'
    ).join('') + '</table>';
}

function button_(label, url, color) {
  return url ? '<a href="' + esc_(url) + '" style="display:inline-block;background:' + color +
    ';color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:6px;margin:4px 8px 4px 0">' +
    esc_(label) + '</a>' : '';
}

/** o: { color, heading, intro: [html], table, buttons: [html], closing: [html] } */
function layout_(cfg, o) {
  const paras = arr => (arr || []).filter(Boolean).map(p => '<p style="margin:0 0 12px">' + p + '</p>').join('');
  const buttons = (o.buttons || []).filter(Boolean).join('');
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1c2321;max-width:640px">' +
    '<div style="border-left:5px solid ' + o.color + ';padding:4px 0 4px 14px;margin-bottom:18px">' +
    '<div style="font-size:12px;letter-spacing:1px;color:' + o.color + ';font-weight:bold;text-transform:uppercase">' + esc_(cfg.dept) + '</div>' +
    '<div style="font-size:18px;font-weight:bold">' + esc_(o.heading) + '</div></div>' +
    paras(o.intro) + (o.table || '') +
    (buttons ? '<div style="margin:18px 0">' + buttons + '</div>' : '') +
    paras(o.closing) +
    '<p style="margin:18px 0 0">Sekian, terima kasih.</p>' +
    '<p style="margin:12px 0 0"><b>' + esc_(cfg.auditorName) + '</b><br>' + esc_(cfg.auditorTitle) + '<br>' + esc_(cfg.dept) + '</p>' +
    '<p style="margin:24px 0 0;font-size:11px;color:#777777">E-mel ini dijana secara automatik oleh sistem CAR/PAR. ' +
    'This is an automated message from the CAR/PAR system.</p></div>';
}

function evidenceHint_(l) {
  return l.evidence
    ? 'Kemukakan bukti penutupan melalui butang <b>Submit Evidence</b> di bawah.'
    : 'Kemukakan bukti penutupan (gambar, rekod atau dokumen) dengan membalas e-mel ini.';
}

// ---------- to the owner ----------

function tplNotice_(cfg, row) {
  const l = links_(cfg, row);
  return {
    subject: '[NC] ' + row.carNo + ' – Notis Ketidakpatuhan' + (row.area ? ': ' + row.area : ''),
    html: layout_(cfg, {
      color: COLOR.info,
      heading: 'Notis Ketidakpatuhan / Non-Conformance Notice',
      intro: [
        'Kepada ' + esc_(row.owner) + ',',
        'A non-conformance has been raised under your responsibility following the compliance walkthrough. Butiran adalah seperti berikut:'
      ],
      table: carTable_(row),
      buttons: [button_('✔ RECEIVED / DITERIMA', l.ack, COLOR.ok), button_('Dispute / Bukan kawasan saya', l.dispute, '#5d6864')],
      closing: [
        'Sila klik <b>RECEIVED</b> untuk mengesahkan penerimaan notis ini. ' +
        'The <b>' + cfg.closureWD + '-working-day</b> closure period starts from your acknowledgement.',
        'Jika penemuan ini bukan di bawah tanggungjawab anda, klik <b>Dispute</b> dan nyatakan sebabnya.'
      ]
    })
  };
}

function tplAckReminder_(cfg, row, n) {
  const l = links_(cfg, row);
  return {
    subject: '[PERINGATAN] ' + row.carNo + ' – Pengesahan Penerimaan Diperlukan',
    html: layout_(cfg, {
      color: COLOR.warn,
      heading: 'Pengesahan Penerimaan Diperlukan / Acknowledgement Required',
      intro: [
        'Kepada ' + esc_(row.owner) + ',',
        'Notis ketidakpatuhan di bawah telah dihantar pada <b>' + esc_(formatDate_(parseDate_(row.sent))) +
        '</b> dan masih <b>belum disahkan</b> (peringatan ke-' + n + ').',
        'Please acknowledge immediately by clicking <b>RECEIVED</b>.'
      ],
      table: carTable_(row),
      buttons: [button_('✔ RECEIVED / DITERIMA', l.ack, COLOR.ok), button_('Dispute / Bukan kawasan saya', l.dispute, '#5d6864')],
      closing: ['Peringatan ini akan dihantar setiap hari bekerja sehingga penerimaan disahkan.']
    })
  };
}

function tplAckConfirm_(cfg, row, due) {
  const l = links_(cfg, row);
  return {
    subject: row.carNo + ' – Penerimaan Disahkan | Tarikh Akhir ' + formatDate_(due),
    html: layout_(cfg, {
      color: COLOR.ok,
      heading: 'Penerimaan Disahkan / Acknowledgement Confirmed',
      intro: [
        'Kepada ' + esc_(row.owner) + ',',
        'Terima kasih. Your acknowledgement has been recorded. Tarikh akhir penutupan CAR ini ialah <b>' + formatDate_(due) +
        '</b> (' + cfg.closureWD + ' hari bekerja).'
      ],
      table: carTable_(row, [['Tarikh Akhir / Due Date', formatDate_(due)]]),
      buttons: [button_('Submit Evidence / Hantar Bukti', l.evidence, COLOR.info)],
      closing: [
        'Sebelum tarikh akhir, anda dikehendaki:<br>☐ Mengenal pasti punca masalah (root cause)<br>☐ Melaksanakan tindakan pembetulan<br>☐ ' + evidenceHint_(l),
        'If you need more time, reply to this email with the reason <b>before</b> the due date to request an extension.'
      ]
    })
  };
}

function tplPre_(cfg, row, due) {
  const l = links_(cfg, row);
  return {
    subject: 'Makluman: ' + row.carNo + ' Tamat Tempoh dalam ' + cfg.preWD + ' Hari Bekerja (' + formatDate_(due) + ')',
    html: layout_(cfg, {
      color: COLOR.info,
      heading: 'Makluman Awal / Advance Notice',
      intro: [
        'Kepada ' + esc_(row.owner) + ',',
        'This is an advance notice that the corrective action below is due in <b>' + cfg.preWD + ' working days</b>, on <b>' + formatDate_(due) + '</b>.',
        'Mohon pastikan tindakan diselesaikan dan bukti penutupan dikemukakan sebelum tarikh akhir.'
      ],
      table: carTable_(row, [['Tarikh Akhir / Due Date', formatDate_(due)]]),
      buttons: [button_('Submit Evidence / Hantar Bukti', l.evidence, COLOR.info)],
      closing: [evidenceHint_(l)]
    })
  };
}

/** n = reminder number after the deadline (1, 2, 3, 4 ...). */
function tplOverdue_(cfg, row, due, daysLate, n) {
  const l = links_(cfg, row);
  const hod = esc_(row.hod || 'Ketua Jabatan');
  const late = '<b>lewat ' + daysLate + ' hari bekerja</b>';
  const table = carTable_(row, [['Tarikh Akhir / Due Date', formatDate_(due)], ['Status', 'Lewat ' + daysLate + ' hari bekerja / ' + daysLate + ' working days overdue']]);
  const buttons = [button_('Submit Evidence / Hantar Bukti', l.evidence, COLOR.info)];
  if (n === 1) {
    return {
      subject: 'Peringatan Pertama: ' + row.carNo + ' Telah Melepasi Tarikh Akhir',
      html: layout_(cfg, {
        color: COLOR.warn, heading: 'Peringatan Pertama / 1st Reminder',
        intro: [
          'Kepada ' + esc_(row.owner) + ',',
          'This is a reminder that corrective action <b>' + esc_(row.carNo) + '</b> passed its due date of <b>' + formatDate_(due) +
          '</b> and remains open (' + late + ').',
          'Mohon lengkapkan tindakan pembetulan dan kemukakan bukti penutupan dengan segera.'
        ],
        table: table, buttons: buttons,
        closing: ['If there are any constraints, please reply to this email so we can discuss.']
      })
    };
  }
  if (n === 2) {
    return {
      subject: '[TINDAKAN SEGERA] Peringatan Kedua: ' + row.carNo + ' Masih Belum Ditutup',
      html: layout_(cfg, {
        color: COLOR.firm, heading: 'Peringatan Kedua – Tindakan Segera / 2nd Reminder',
        intro: [
          'Kepada ' + esc_(row.owner) + ',<br>Untuk makluman ' + hod + ',',
          'Merujuk kepada peringatan sebelum ini, tindakan pembetulan <b>' + esc_(row.carNo) + '</b> masih belum ditutup dan kini ' + late + '.',
          'This finding relates to compliance with company SOP and DOE/DOSH requirements. An open item is a risk to the company during any audit or inspection.'
        ],
        table: table, buttons: buttons,
        closing: ['Anda dikehendaki melengkapkan tindakan pembetulan dan mengemukakan bukti penutupan <b>dengan kadar segera</b>. ' +
          'Failure to do so will be escalated further.']
      })
    };
  }
  return {
    subject: '[ESKALASI] Peringatan Ke-' + n + ': ' + row.carNo + ' Tertunggak ' + daysLate + ' Hari Bekerja',
    html: layout_(cfg, {
      color: COLOR.esc, heading: 'Eskalasi – Peringatan Ke-' + n + ' / Escalation',
      intro: [
        'Kepada ' + esc_(row.owner) + ',<br>Untuk makluman ' + hod + ',',
        'Tindakan pembetulan <b>' + esc_(row.carNo) + '</b> masih belum ditutup walaupun ' + (n - 1) + ' peringatan telah dihantar. Ia kini ' + late + '.',
        'This item is a non-compliance against company SOP and/or legal requirements and will be recorded as outstanding in the next management review and audit report.'
      ],
      table: table, buttons: buttons,
      closing: [hod + ', mohon kerjasama tuan/puan untuk memastikan tindakan ini ditutup dengan segera.',
        'Peringatan akan terus dihantar setiap ' + cfg.repeatGap + ' hari bekerja sehingga CAR ini ditutup.']
    })
  };
}

function tplEvidenceRejected_(cfg, row, reason, due) {
  const l = links_(cfg, row);
  return {
    subject: row.carNo + ' – Bukti Penutupan Tidak Diterima / Evidence Not Accepted',
    html: layout_(cfg, {
      color: COLOR.firm, heading: 'Bukti Tidak Diterima / Evidence Not Accepted',
      intro: [
        'Kepada ' + esc_(row.owner) + ',',
        'Bukti penutupan yang dikemukakan untuk <b>' + esc_(row.carNo) + '</b> telah disemak dan <b>tidak diterima</b>.',
        '<b>Sebab / Reason:</b> ' + esc_(reason)
      ],
      table: carTable_(row, [['Tarikh Akhir / Due Date', formatDate_(due)]]),
      buttons: [button_('Submit Evidence / Hantar Bukti', l.evidence, COLOR.info)],
      closing: ['The CAR remains open and reminders will resume. Mohon kemukakan bukti yang lengkap dengan segera.']
    })
  };
}

function tplClosed_(cfg, row, closedDate) {
  return {
    subject: row.carNo + ' – Ditutup / Closed',
    html: layout_(cfg, {
      color: COLOR.ok, heading: 'CAR Ditutup / CAR Closed',
      intro: [
        'Kepada ' + esc_(row.owner) + ',',
        'Bukti penutupan telah disemak dan disahkan. Corrective action <b>' + esc_(row.carNo) + '</b> is now <b>closed</b> as of ' + formatDate_(closedDate) + '.',
        'Terima kasih atas kerjasama anda. Please ensure the corrective action is maintained – an effectiveness check will be carried out.'
      ],
      table: carTable_(row, [['Tarikh Ditutup / Closed', formatDate_(closedDate)], ['Disahkan oleh / Verified by', cfg.auditorName]])
    })
  };
}

function tplExtension_(cfg, row, newDue, oldDue) {
  const l = links_(cfg, row);
  return {
    subject: row.carNo + ' – Lanjutan Tarikh Akhir Diluluskan: ' + formatDate_(newDue),
    html: layout_(cfg, {
      color: COLOR.info, heading: 'Lanjutan Diluluskan / Extension Approved',
      intro: [
        'Kepada ' + esc_(row.owner) + ',',
        'Permohonan lanjutan untuk <b>' + esc_(row.carNo) + '</b> telah diluluskan. The due date has changed from ' +
        formatDate_(oldDue) + ' to <b>' + formatDate_(newDue) + '</b>.',
        'Tiada lanjutan tambahan akan diberikan tanpa justifikasi yang kukuh.'
      ],
      table: carTable_(row, [['Tarikh Akhir Baharu / New Due Date', formatDate_(newDue)]]),
      buttons: [button_('Submit Evidence / Hantar Bukti', l.evidence, COLOR.info)]
    })
  };
}

// ---------- to the auditor ----------

function tplDispute_(cfg, row, reason) {
  return {
    subject: '[PERTIKAIAN] ' + row.carNo + ' – ' + row.owner,
    html: layout_(cfg, {
      color: COLOR.warn, heading: 'Pertikaian Diterima / Dispute Raised',
      intro: [
        esc_(row.owner) + ' (' + esc_(row.ownerEmail) + ') has disputed <b>' + esc_(row.carNo) + '</b>.',
        '<b>Sebab / Reason:</b> ' + esc_(reason),
        'Reminders for this CAR are paused. Use <b>Compliance ▸ Reassign owner</b> to send it to the correct person, or set Status back to Sent.'
      ],
      table: carTable_(row)
    })
  };
}

function tplEvidenceReceived_(cfg, row, evidence) {
  return {
    subject: '[SEMAKAN] Bukti Diterima: ' + row.carNo + ' – ' + row.owner,
    html: layout_(cfg, {
      color: COLOR.info, heading: 'Bukti Untuk Disemak / Evidence to Verify',
      intro: [
        esc_(row.owner) + ' has submitted closure evidence for <b>' + esc_(row.carNo) + '</b>. Reminders are paused until you verify it.',
        '<b>Submission:</b><br>' + esc_(evidence).replace(/\n/g, '<br>'),
        'Use <b>Compliance ▸ Close selected CAR</b> to accept, or <b>Compliance ▸ Reject evidence</b> to return it to the owner.'
      ],
      table: carTable_(row)
    })
  };
}

function tplEffectiveness_(cfg, row, closedDate) {
  return {
    subject: '[KEBERKESANAN] Semakan Keberkesanan: ' + row.carNo,
    html: layout_(cfg, {
      color: COLOR.info, heading: 'Semakan Keberkesanan / Effectiveness Check Due',
      intro: [
        '<b>' + esc_(row.carNo) + '</b> was closed on ' + formatDate_(closedDate) + '. It is now time to verify that the corrective action is effective and the issue has not recurred (ISO 14001 cl. 10.2).',
        'Jika isu berulang, buka CAR baharu dan rujuk CAR ini.'
      ],
      table: carTable_(row, [['Pemilik / Owner', row.owner]])
    })
  };
}
