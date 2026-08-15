import { NextRequest, NextResponse } from 'next/server';
import { robinhoodConnection } from '@/lib/robinhood';

/**
 * Begin the link and send the browser straight to Robinhood.
 *
 * A plain redirect rather than JSON, so connecting is one click from the
 * settings page. Starting the flow has to happen server-side anyway — this is
 * where discovery, client registration and the PKCE verifier are stored — so
 * the browser never handles anything it shouldn't.
 */
export async function GET(request: NextRequest) {
  try {
    return NextResponse.redirect(await robinhoodConnection(request.url).beginLink());
  } catch (err) {
    const settings = new URL('/settings', request.nextUrl.origin);
    settings.searchParams.set('error', (err as Error).message);
    return NextResponse.redirect(settings);
  }
}
