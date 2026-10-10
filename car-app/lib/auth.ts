import 'server-only';
import { redirect } from 'next/navigation';
import { sessionClient } from './supabase/server';
import { adminClient } from './supabase/admin';

export interface Auditor { email: string; name: string }

/** Signed-in user who is on the auditors allow-list, or redirect to /login. */
export async function requireAuditor(): Promise<Auditor> {
  const supabase = await sessionClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (!email) redirect('/login');
  const { data: list } = await adminClient().from('auditors').select('email, name');
  const row = (list ?? []).find(a => String(a.email).toLowerCase() === email);
  if (!row) redirect('/login?e=not-auditor');
  return { email, name: row.name || email };
}
