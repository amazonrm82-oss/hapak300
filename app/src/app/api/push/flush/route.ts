import { NextResponse } from 'next/server';
import { admin, anon, withinRate } from '@/lib/server/admin';
import { deliverPending } from '@/lib/server/push';

/**
 * Sends whatever notifications are still waiting to reach a phone.
 *
 * The scheduled job already drains this queue, but on its own clock — a
 * training set for tomorrow morning would sit unsent until the next tick. The
 * app calls this the moment a training is published, so the team's phones ring
 * while the commander is still looking at the screen.
 *
 * It sends only what is already queued, to the people that notification names,
 * so calling it cannot deliver anything to anyone who was not already owed it.
 * A signed-in caller is still required, and the rate limit keeps it from being
 * used as a way to hammer the push services.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return NextResponse.json({ error: 'נדרשת התחברות' }, { status: 401 });

  const { data: auth, error } = await anon().auth.getUser(token);
  const personId = auth?.user?.app_metadata?.person_id as string | undefined;
  if (error || !personId)
    return NextResponse.json({ error: 'ההתחברות פגה — היכנס מחדש' }, { status: 401 });

  const db = admin();
  if (!(await withinRate(db, `pushflush:${personId}`, 30, 600)))
    return NextResponse.json({ sent: 0, skipped: 'rate' });

  const sent = await deliverPending(db);
  return NextResponse.json({ sent });
}
