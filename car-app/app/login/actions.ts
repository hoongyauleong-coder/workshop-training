'use server';
import { redirect } from 'next/navigation';
import { sessionClient } from '@/lib/supabase/server';

export async function signIn(formData: FormData) {
  const supabase = await sessionClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get('email') || '').trim(),
    password: String(formData.get('password') || '')
  });
  if (error) redirect('/login?e=bad-login');
  redirect('/');
}

export async function signOut() {
  const supabase = await sessionClient();
  await supabase.auth.signOut();
  redirect('/login');
}
