import { NextResponse, type NextRequest } from 'next/server';
import { runReminders } from '@/lib/engine';
import { liveCtx } from '@/lib/repo';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Called by Vercel Cron every day at 00:00 UTC = 08:00 Malaysia (see vercel.json). */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await runReminders(liveCtx());
  return NextResponse.json(result);
}
