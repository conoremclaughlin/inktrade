import { NextRequest, NextResponse } from 'next/server';
import { getOptionsService } from '@/lib/engine';
import type { OptionType } from '@inktrade/engine';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const symbol = params.get('symbol');
  const strike = params.get('strike');
  const type = params.get('type') as OptionType | null;

  if (!symbol || !strike || !type) {
    return NextResponse.json(
      { error: 'symbol, strike, and type are required' },
      { status: 400 },
    );
  }

  const expiry = params.get('expiry');
  const rangePct = params.get('rangePct');

  try {
    const svc = getOptionsService();
    const analysis = await svc.leverage({
      symbol,
      strike: parseFloat(strike),
      type,
      expiry: expiry ?? undefined,
      rangePct: rangePct ? parseFloat(rangePct) : 30,
    });
    return NextResponse.json(analysis);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
