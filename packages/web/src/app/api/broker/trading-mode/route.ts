import { NextRequest, NextResponse } from 'next/server';
import { isModeUserControlled } from '@inktrade/client';
import {
  USER_SELECTABLE_MODES,
  isSelectableMode,
  saveTradingModeSetting,
  tradingMode,
} from '@/lib/trading-mode';

export async function GET() {
  return NextResponse.json(await tradingMode());
}

/** Change the user's own preference. Refused while an env override is active. */
export async function PUT(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { mode?: unknown };
  if (!isSelectableMode(body.mode)) {
    return NextResponse.json(
      { error: `mode must be one of ${USER_SELECTABLE_MODES.join(', ')}` },
      { status: 400 },
    );
  }

  const current = await tradingMode();
  if (!isModeUserControlled(current)) {
    // Accepting a write the env immediately overrides would report success for
    // a change that had no effect.
    return NextResponse.json({ error: current.reason }, { status: 403 });
  }

  await saveTradingModeSetting(body.mode);
  return NextResponse.json(await tradingMode());
}
