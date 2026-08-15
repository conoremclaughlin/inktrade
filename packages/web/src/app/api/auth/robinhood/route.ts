import { NextRequest, NextResponse } from 'next/server';
import { redirectUriFor, resetRobinhoodRuntime, robinhoodConnection } from '@/lib/robinhood';

/** Link status, plus the URL to start authorization when not yet linked. */
export async function GET(request: NextRequest) {
  const redirectUri = redirectUriFor(request.url);

  try {
    const connection = robinhoodConnection(request.url);

    if (await connection.isLinked()) {
      return NextResponse.json({ status: 'connected', redirectUri });
    }

    return NextResponse.json({
      status: 'disconnected',
      redirectUri,
      authUrl: await connection.beginLink(),
    });
  } catch (err) {
    // The loopback guard lands here when Inktrade is served from anywhere but
    // localhost — worth saying plainly, since no amount of retrying fixes it.
    return NextResponse.json(
      { status: 'unavailable', redirectUri, error: (err as Error).message },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  await robinhoodConnection(request.url).unlink();
  // Drop the shared session too, or the next request keeps using the token we
  // just discarded.
  resetRobinhoodRuntime();
  return NextResponse.json({ status: 'disconnected' });
}
