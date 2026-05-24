import { NextRequest, NextResponse } from 'next/server';
import { getOptionsService } from '@/lib/engine';
import type { OptionType } from '@inktrade/engine';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const symbol = params.get('symbol');
  if (!symbol) {
    return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
  }

  const type = params.get('type') as OptionType | null;
  const expiry = params.get('expiry');
  const strikeCount = params.get('strikeCount');

  try {
    const svc = getOptionsService();
    const chain = await svc.chain({
      symbol,
      type: type ?? undefined,
      expiry: expiry ?? undefined,
      strikeCount: strikeCount ? parseInt(strikeCount, 10) : 40,
    });
    return NextResponse.json(chain);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
