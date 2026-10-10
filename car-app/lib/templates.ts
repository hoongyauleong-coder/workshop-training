/**
 * Email templates – firm and formal, mixed BM + English (ECOM style).
 * Owner buttons open the owner page (/o/<token>). Actions there need a click on the page itself,
 * so email link scanners that "pre-open" links can never acknowledge a CAR by accident.
 */
import { fmt } from './dates';
import type { Car, Settings } from './types';

export interface Tpl { subject: string; html: string }
export interface TplCtx { s: Settings; appUrl: string }

const COLOR = { info: '#1f4e79', ok: '#2f7d4f', warn: '#8a6d00', firm: '#c2571a', esc: '#b42318', grey: '#5d6864' };

export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

export function ownerUrl(ctx: TplCtx, car: Car, action?: 'ack' | 'dispute' | 'evidence'): string {
  return `${ctx.appUrl}/o/${car.token}${action ? `?do=${action}` : ''}`;
}

function carTable(car: Car, extra: [string, string][] = []): string {
  const rows: [string, string][] = [
    ['CAR No', car.car_no ?? ''],
    ['Kawasan / Area', car.area],
    ['Penemuan / Finding', car.finding],
    ['Rujukan / Requirement', car.requirement_ref],
    ['Tahap / Severity', car.severity],
    ...extra
  ];
  return '<table style="border-collapse:collapse;width:100%;margin:8px 0 4px;font-size:14px">' +
    rows.filter(r => r[1]).map(r =>
      '<tr><td style="padding:8px 10px;border:1px solid #dde2de;background:#f5f6f3;width:34%;font-weight:bold;vertical-align:top">' +
      esc(r[0]) + '</td><td style="padding:8px 10px;border:1px solid #dde2de;vertical-align:top">' + esc(r[1]) + '</td></tr>'
    ).join('') + '</table>';
}

function button(label: string, url: string, color: string): string {
  return `<a href="${esc(url)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:6px;margin:4px 8px 4px 0">${esc(label)}</a>`;
}

function layout(ctx: TplCtx, o: { color: string; heading: string; intro: string[]; table?: string; buttons?: string[]; closing?: string[] }): string {
  const paras = (a?: string[]) => (a ?? []).filter(Boolean).map(p => `<p style="margin:0 0 12px">${p}</p>`).join('');
  const buttons = (o.buttons ?? []).join('');
  const s = ctx.s;
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1c2321;max-width:640px">' +
    `<div style="border-left:5px solid ${o.color};padding:4px 0 4px 14px;margin-bottom:18px">` +
    `<div style="font-size:12px;letter-spacing:1px;color:${o.color};font-weight:bold;text-transform:uppercase">${esc(s.dept)}</div>` +
    `<div style="font-size:18px;font-weight:bold">${esc(o.heading)}</div></div>` +
    paras(o.intro) + (o.table ?? '') +
    (buttons ? `<div style="margin:18px 0">${buttons}</div>` : '') +
    paras(o.closing) +
    '<p style="margin:18px 0 0">Sekian, terima kasih.</p>' +
    `<p style="margin:12px 0 0"><b>${esc(s.auditor_name)}</b><br>${esc(s.auditor_title)}<br>${esc(s.dept)}</p>` +
    '<p style="margin:24px 0 0;font-size:11px;color:#777777">E-mel ini dijana secara automatik oleh sistem CAR/PAR. This is an automated message from the CAR/PAR system.</p></div>';
}

const evidenceBtn = (ctx: TplCtx, car: Car) => button('Submit Evidence / Hantar Bukti', ownerUrl(ctx, car, 'evidence'), COLOR.info);
const ackBtns = (ctx: TplCtx, car: Car) => [
  button('✔ RECEIVED / DITERIMA', ownerUrl(ctx, car, 'ack'), COLOR.ok),
  button('Dispute / Bukan kawasan saya', ownerUrl(ctx, car, 'dispute'), COLOR.grey)
];

// ---------- to the owner ----------

export function tplNotice(ctx: TplCtx, car: Car): Tpl {
  return {
    subject: `[NC] ${car.car_no} – Notis Ketidakpatuhan${car.area ? ': ' + car.area : ''}`,
    html: layout(ctx, {
      color: COLOR.info,
      heading: 'Notis Ketidakpatuhan / Non-Conformance Notice',
      intro: [`Kepada ${esc(car.owner_name)},`,
        'A non-conformance has been raised under your responsibility following the compliance walkthrough. Butiran adalah seperti berikut:'],
      table: carTable(car),
      buttons: ackBtns(ctx, car),
      closing: [
        `Sila klik <b>RECEIVED</b> untuk mengesahkan penerimaan notis ini. The <b>${ctx.s.closure_wd}-working-day</b> closure period starts from your acknowledgement.`,
        'Jika penemuan ini bukan di bawah tanggungjawab anda, klik <b>Dispute</b> dan nyatakan sebabnya.'
      ]
    })
  };
}

export function tplAckReminder(ctx: TplCtx, car: Car, n: number): Tpl {
  return {
    subject: `[PERINGATAN] ${car.car_no} – Pengesahan Penerimaan Diperlukan`,
    html: layout(ctx, {
      color: COLOR.warn,
      heading: 'Pengesahan Penerimaan Diperlukan / Acknowledgement Required',
      intro: [`Kepada ${esc(car.owner_name)},`,
        `Notis ketidakpatuhan di bawah telah dihantar pada <b>${fmt(car.sent_date)}</b> dan masih <b>belum disahkan</b> (peringatan ke-${n}).`,
        'Please acknowledge immediately by clicking <b>RECEIVED</b>.'],
      table: carTable(car),
      buttons: ackBtns(ctx, car),
      closing: ['Peringatan ini akan dihantar setiap hari bekerja sehingga penerimaan disahkan.']
    })
  };
}

export function tplAckConfirm(ctx: TplCtx, car: Car, due: string): Tpl {
  return {
    subject: `${car.car_no} – Penerimaan Disahkan | Tarikh Akhir ${fmt(due)}`,
    html: layout(ctx, {
      color: COLOR.ok,
      heading: 'Penerimaan Disahkan / Acknowledgement Confirmed',
      intro: [`Kepada ${esc(car.owner_name)},`,
        `Terima kasih. Your acknowledgement has been recorded. Tarikh akhir penutupan CAR ini ialah <b>${fmt(due)}</b> (${ctx.s.closure_wd} hari bekerja).`],
      table: carTable(car, [['Tarikh Akhir / Due Date', fmt(due)]]),
      buttons: [evidenceBtn(ctx, car)],
      closing: [
        'Sebelum tarikh akhir, anda dikehendaki:<br>☐ Mengenal pasti punca masalah (root cause)<br>☐ Melaksanakan tindakan pembetulan<br>☐ Mengemukakan bukti penutupan (gambar / dokumen) melalui butang <b>Submit Evidence</b>',
        'If you need more time, reply to this email with the reason <b>before</b> the due date to request an extension.'
      ]
    })
  };
}

export function tplPre(ctx: TplCtx, car: Car, due: string): Tpl {
  return {
    subject: `Makluman: ${car.car_no} Tamat Tempoh dalam ${ctx.s.pre_wd} Hari Bekerja (${fmt(due)})`,
    html: layout(ctx, {
      color: COLOR.info,
      heading: 'Makluman Awal / Advance Notice',
      intro: [`Kepada ${esc(car.owner_name)},`,
        `This is an advance notice that the corrective action below is due in <b>${ctx.s.pre_wd} working days</b>, on <b>${fmt(due)}</b>.`,
        'Mohon pastikan tindakan diselesaikan dan bukti penutupan dikemukakan sebelum tarikh akhir.'],
      table: carTable(car, [['Tarikh Akhir / Due Date', fmt(due)]]),
      buttons: [evidenceBtn(ctx, car)]
    })
  };
}

/** n = reminder number after the deadline (1, 2, 3, 4 ...). */
export function tplOverdue(ctx: TplCtx, car: Car, due: string, daysLate: number, n: number): Tpl {
  const hod = esc(car.hod_name || 'Ketua Jabatan');
  const late = `<b>lewat ${daysLate} hari bekerja</b>`;
  const table = carTable(car, [['Tarikh Akhir / Due Date', fmt(due)], ['Status', `Lewat ${daysLate} hari bekerja / ${daysLate} working days overdue`]]);
  const buttons = [evidenceBtn(ctx, car)];
  if (n === 1) {
    return {
      subject: `Peringatan Pertama: ${car.car_no} Telah Melepasi Tarikh Akhir`,
      html: layout(ctx, {
        color: COLOR.warn, heading: 'Peringatan Pertama / 1st Reminder',
        intro: [`Kepada ${esc(car.owner_name)},`,
          `This is a reminder that corrective action <b>${esc(car.car_no)}</b> passed its due date of <b>${fmt(due)}</b> and remains open (${late}).`,
          'Mohon lengkapkan tindakan pembetulan dan kemukakan bukti penutupan dengan segera.'],
        table, buttons,
        closing: ['If there are any constraints, please reply to this email so we can discuss.']
      })
    };
  }
  if (n === 2) {
    return {
      subject: `[TINDAKAN SEGERA] Peringatan Kedua: ${car.car_no} Masih Belum Ditutup`,
      html: layout(ctx, {
        color: COLOR.firm, heading: 'Peringatan Kedua – Tindakan Segera / 2nd Reminder',
        intro: [`Kepada ${esc(car.owner_name)},<br>Untuk makluman ${hod},`,
          `Merujuk kepada peringatan sebelum ini, tindakan pembetulan <b>${esc(car.car_no)}</b> masih belum ditutup dan kini ${late}.`,
          'This finding relates to compliance with company SOP and DOE/DOSH requirements. An open item is a risk to the company during any audit or inspection.'],
        table, buttons,
        closing: ['Anda dikehendaki melengkapkan tindakan pembetulan dan mengemukakan bukti penutupan <b>dengan kadar segera</b>. Failure to do so will be escalated further.']
      })
    };
  }
  return {
    subject: `[ESKALASI] Peringatan Ke-${n}: ${car.car_no} Tertunggak ${daysLate} Hari Bekerja`,
    html: layout(ctx, {
      color: COLOR.esc, heading: `Eskalasi – Peringatan Ke-${n} / Escalation`,
      intro: [`Kepada ${esc(car.owner_name)},<br>Untuk makluman ${hod},`,
        `Tindakan pembetulan <b>${esc(car.car_no)}</b> masih belum ditutup walaupun ${n - 1} peringatan telah dihantar. Ia kini ${late}.`,
        'This item is a non-compliance against company SOP and/or legal requirements and will be recorded as outstanding in the next management review and audit report.'],
      table, buttons,
      closing: [`${hod}, mohon kerjasama tuan/puan untuk memastikan tindakan ini ditutup dengan segera.`,
        `Peringatan akan terus dihantar setiap ${ctx.s.repeat_gap} hari bekerja sehingga CAR ini ditutup.`]
    })
  };
}

export function tplEvidenceRejected(ctx: TplCtx, car: Car, reason: string, due: string | null): Tpl {
  return {
    subject: `${car.car_no} – Bukti Penutupan Tidak Diterima / Evidence Not Accepted`,
    html: layout(ctx, {
      color: COLOR.firm, heading: 'Bukti Tidak Diterima / Evidence Not Accepted',
      intro: [`Kepada ${esc(car.owner_name)},`,
        `Bukti penutupan yang dikemukakan untuk <b>${esc(car.car_no)}</b> telah disemak dan <b>tidak diterima</b>.`,
        `<b>Sebab / Reason:</b> ${esc(reason)}`],
      table: carTable(car, due ? [['Tarikh Akhir / Due Date', fmt(due)]] : []),
      buttons: [evidenceBtn(ctx, car)],
      closing: ['The CAR remains open and reminders will resume. Mohon kemukakan bukti yang lengkap dengan segera.']
    })
  };
}

export function tplClosed(ctx: TplCtx, car: Car, closed: string): Tpl {
  return {
    subject: `${car.car_no} – Ditutup / Closed`,
    html: layout(ctx, {
      color: COLOR.ok, heading: 'CAR Ditutup / CAR Closed',
      intro: [`Kepada ${esc(car.owner_name)},`,
        `Bukti penutupan telah disemak dan disahkan. Corrective action <b>${esc(car.car_no)}</b> is now <b>closed</b> as of ${fmt(closed)}.`,
        'Terima kasih atas kerjasama anda. Please ensure the corrective action is maintained – an effectiveness check will be carried out.'],
      table: carTable(car, [['Tarikh Ditutup / Closed', fmt(closed)], ['Disahkan oleh / Verified by', ctx.s.auditor_name]])
    })
  };
}

export function tplExtension(ctx: TplCtx, car: Car, newDue: string, oldDue: string | null): Tpl {
  return {
    subject: `${car.car_no} – Lanjutan Tarikh Akhir Diluluskan: ${fmt(newDue)}`,
    html: layout(ctx, {
      color: COLOR.info, heading: 'Lanjutan Diluluskan / Extension Approved',
      intro: [`Kepada ${esc(car.owner_name)},`,
        `Permohonan lanjutan untuk <b>${esc(car.car_no)}</b> telah diluluskan. The due date has changed from ${fmt(oldDue)} to <b>${fmt(newDue)}</b>.`,
        'Tiada lanjutan tambahan akan diberikan tanpa justifikasi yang kukuh.'],
      table: carTable(car, [['Tarikh Akhir Baharu / New Due Date', fmt(newDue)]]),
      buttons: [evidenceBtn(ctx, car)]
    })
  };
}

// ---------- to the auditor ----------

export function tplDispute(ctx: TplCtx, car: Car, reason: string): Tpl {
  return {
    subject: `[PERTIKAIAN] ${car.car_no} – ${car.owner_name}`,
    html: layout(ctx, {
      color: COLOR.warn, heading: 'Pertikaian Diterima / Dispute Raised',
      intro: [`${esc(car.owner_name)} (${esc(car.owner_email)}) has disputed <b>${esc(car.car_no)}</b>.`,
        `<b>Sebab / Reason:</b> ${esc(reason)}`,
        'Reminders for this CAR are paused. Open it in the app to reassign it to the correct owner.'],
      table: carTable(car),
      buttons: [button('Open CAR', `${ctx.appUrl}/cars/${car.id}`, COLOR.info)]
    })
  };
}

export function tplEvidenceReceived(ctx: TplCtx, car: Car, rootCause: string, action: string, files: number): Tpl {
  return {
    subject: `[SEMAKAN] Bukti Diterima: ${car.car_no} – ${car.owner_name}`,
    html: layout(ctx, {
      color: COLOR.info, heading: 'Bukti Untuk Disemak / Evidence to Verify',
      intro: [`${esc(car.owner_name)} has submitted closure evidence for <b>${esc(car.car_no)}</b>. Reminders are paused until you verify it.`,
        `<b>Root cause:</b> ${esc(rootCause)}<br><b>Action taken:</b> ${esc(action)}<br><b>Files:</b> ${files}`],
      table: carTable(car),
      buttons: [button('Review evidence', `${ctx.appUrl}/cars/${car.id}`, COLOR.info)]
    })
  };
}

export function tplEffectiveness(ctx: TplCtx, car: Car, closed: string): Tpl {
  return {
    subject: `[KEBERKESANAN] Semakan Keberkesanan: ${car.car_no}`,
    html: layout(ctx, {
      color: COLOR.info, heading: 'Semakan Keberkesanan / Effectiveness Check Due',
      intro: [`<b>${esc(car.car_no)}</b> was closed on ${fmt(closed)}. It is now time to verify that the corrective action is effective and the issue has not recurred (ISO 14001 cl. 10.2).`,
        'Jika isu berulang, buka CAR baharu dan rujuk CAR ini.'],
      table: carTable(car, [['Pemilik / Owner', car.owner_name]]),
      buttons: [button('Open CAR', `${ctx.appUrl}/cars/${car.id}`, COLOR.info)]
    })
  };
}

export function htmlToText(html: string): string {
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
