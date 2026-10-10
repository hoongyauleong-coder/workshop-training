/**
 * The reminder engine. dailyRun() is called by a time trigger every morning at 08:00 (Asia/Kuala_Lumpur).
 * Safe to run more than once a day: each stage is sent only once per CAR.
 *
 * Owner ladder after acknowledgement (working days):
 *   PRE   = due − 5           friendly
 *   R1    = due + 1           firm
 *   R2    = R1 + 3            cc HOD
 *   R3#k  = R2 + 3k (k ≥ 1)   cc HOD (+ extra CC), repeats until Closed
 */

function dailyRun() { return runReminders_(); }

function runReminders_() {
  return withLock_(() => {
    const cfg = cfg_();
    const hol = readHolidays_();
    const today = today_(cfg);
    if (!isWorkday(today, hol)) return { skipped: true, sent: 0 };
    const reg = openRegister_();
    let sent = 0;
    reg.rows.forEach(row => {
      try {
        sent += processRow_(cfg, hol, today, reg, row);
      } catch (err) {
        logEvent_(row.carNo, 'ERROR', '', '', String(err && err.message || err), cfg.testMode);
      }
    });
    return { skipped: false, sent: sent };
  });
}

function stageRank_(s) {
  if (!s) return 0;
  const base = { PRE: 1, R1: 2, R2: 3 }[s];
  if (base) return base;
  const m = /^R3#(\d+)$/.exec(s);
  return m ? 3 + Number(m[1]) : 0;
}

/** Which ladder stage should have been reached by `today` for a CAR due on `due`. */
function ladderStage_(due, today, cfg, hol) {
  const pre = addWorkdays(due, -cfg.preWD, hol);
  const r1 = addWorkdays(due, cfg.r1WD, hol);
  const r2 = addWorkdays(r1, cfg.r2Gap, hol);
  if (today >= r2) {
    const k = Math.floor(workdaysBetween(r2, today, hol) / cfg.repeatGap);
    return k >= 1 ? 'R3#' + k : 'R2';
  }
  if (today >= r1) return 'R1';
  if (cfg.preWD > 0 && today >= pre) return 'PRE';
  return '';
}

/** Returns the number of emails sent for this row (0 or 1). */
function processRow_(cfg, hol, today, reg, row) {
  if (row.status === STATUS.SENT) {
    const sentDate = parseDate_(row.sent);
    const last = parseDate_(row.lastSent);
    if (sentDate && sentDate < today && (!last || last < today)) {
      const n = (Number(row.ackRem) || 0) + 1;
      sendMail_(cfg, row.carNo, 'ACK_REMINDER_' + n, row.ownerEmail, [], tplAckReminder_(cfg, row, n));
      reg.set(row, 'ackRem', n);
      reg.set(row, 'lastSent', today);
      return 1;
    }
    return 0;
  }

  if (row.status === STATUS.ACK) {
    const due = parseDate_(row.extDue) || parseDate_(row.due);
    if (!due) return 0;
    const target = ladderStage_(due, today, cfg, hol);
    if (stageRank_(target) <= stageRank_(row.stage)) return 0;
    if (target === 'PRE') {
      sendMail_(cfg, row.carNo, 'PRE_DEADLINE', row.ownerEmail, [], tplPre_(cfg, row, due));
    } else {
      const n = target === 'R1' ? 1 : target === 'R2' ? 2 : 2 + Number(target.split('#')[1]);
      const cc = n >= 2 ? [row.hodEmail] : [];
      if (n >= 3 && cfg.extraCc) cc.push(cfg.extraCc);
      sendMail_(cfg, row.carNo, 'REMINDER_' + n, row.ownerEmail, cc, tplOverdue_(cfg, row, due, workdaysBetween(due, today, hol), n));
    }
    reg.set(row, 'stage', target);
    reg.set(row, 'lastSent', today);
    return 1;
  }

  if (row.status === STATUS.CLOSED) {
    const closed = parseDate_(row.closed);
    if (closed && cfg.effWD > 0 && row.stage !== 'EFFECT' && today >= addWorkdays(closed, cfg.effWD, hol)) {
      sendMail_(cfg, row.carNo, 'EFFECTIVENESS_CHECK', cfg.auditorEmail, [], tplEffectiveness_(cfg, row, closed));
      reg.set(row, 'stage', 'EFFECT');
      return 1;
    }
  }
  // Evidence Submitted, Disputed, New, Cancelled: paused / nothing to send.
  return 0;
}
