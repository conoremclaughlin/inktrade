import { NextResponse } from 'next/server';

/**
 * No brokerage linked.
 *
 * A distinct status rather than an error, because "connect your brokerage" is
 * a state the UI should offer to fix, not a failure to report.
 */
export function disconnected() {
  return NextResponse.json(
    { error: 'No brokerage is linked', status: 'disconnected' },
    { status: 404 },
  );
}

/** An upstream failure — ours only in the sense that we asked. */
export function brokerError(err: unknown) {
  return NextResponse.json({ error: (err as Error).message }, { status: 502 });
}
