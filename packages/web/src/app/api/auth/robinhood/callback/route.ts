import { NextRequest, NextResponse } from 'next/server';
import { robinhoodConnection } from '@/lib/robinhood';

/**
 * Where Robinhood returns the user after they approve.
 *
 * The connection verifies `state` against the value it issued, so a forged
 * callback can't plant someone else's authorization code in this session.
 */
export async function GET(request: NextRequest) {
  const settings = new URL('/settings', request.nextUrl.origin);
  const params = request.nextUrl.searchParams;

  // Never render error_description back to the user — in a mix-up attack it is
  // attacker-controlled text. Report only that the provider refused.
  if (params.get('error')) {
    settings.searchParams.set('error', 'robinhood_denied');
    return NextResponse.redirect(settings);
  }

  try {
    await robinhoodConnection(request.url).completeLink(params);
    settings.searchParams.set('linked', 'robinhood');
  } catch (err) {
    settings.searchParams.set('error', (err as Error).message);
  }

  return NextResponse.redirect(settings);
}
