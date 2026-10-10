import 'server-only';
import type { Repo, Ctx } from './engine';
import { adminClient } from './supabase/admin';
import { gmailMailer } from './mailer';
import type { Car, Evidence, LogEntry, NewCar, Settings, Status } from './types';

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export function supabaseRepo(): Repo {
  const db = adminClient();
  return {
    async settings() {
      return check(await db.from('settings').select('*').eq('id', 1).single()) as Settings;
    },
    async holidays() {
      const rows = check(await db.from('holidays').select('date')) as { date: string }[];
      return new Set(rows.map(r => r.date));
    },
    async cars(statuses?: Status[]) {
      let q = db.from('cars').select('*').order('created_at', { ascending: true });
      if (statuses) q = q.in('status', statuses);
      return check(await q) as Car[];
    },
    async carById(id) {
      return check(await db.from('cars').select('*').eq('id', id).maybeSingle()) as Car | null;
    },
    async carByToken(token) {
      if (!/^[a-f0-9]{32,64}$/.test(token)) return null;
      return check(await db.from('cars').select('*').eq('token', token).maybeSingle()) as Car | null;
    },
    async updateCar(id, patch, expectStatus) {
      let q = db.from('cars').update(patch).eq('id', id);
      if (expectStatus) q = q.eq('status', expectStatus);
      return check(await q.select('*').maybeSingle()) as Car | null;
    },
    async insertCars(rows: NewCar[]) {
      return check(await db.from('cars').insert(rows.map(r => ({ ...r, car_no: r.car_no || null }))).select('*')) as Car[];
    },
    async carNosLike(stem) {
      const rows = check(await db.from('cars').select('car_no').like('car_no', `${stem}%`)) as { car_no: string }[];
      return rows.map(r => r.car_no);
    },
    async log(e: LogEntry) {
      check(await db.from('email_log').insert(e));
    },
    async addEvidence(e) {
      return check(await db.from('evidence').insert(e).select('*').single()) as Evidence;
    },
    async pendingEvidence(carId) {
      return check(await db.from('evidence').select('*').eq('car_id', carId).eq('decision', 'Pending')
        .order('submitted_at', { ascending: false }).limit(1).maybeSingle()) as Evidence | null;
    },
    async updateEvidence(id, patch) {
      check(await db.from('evidence').update(patch).eq('id', id));
    }
  };
}

export function appUrl(): string {
  const url = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');
  return url.replace(/\/$/, '');
}

/** Everything the workflow engine needs, wired to Supabase + Gmail. */
export function liveCtx(): Ctx {
  return {
    repo: supabaseRepo(),
    mailer: gmailMailer(),
    appUrl: appUrl(),
    fallbackAuditorEmail: process.env.GMAIL_USER || ''
  };
}
