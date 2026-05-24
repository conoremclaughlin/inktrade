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
  const offset = Math.max(0, parseInt(params.get('offset') ?? '0', 10));
  const limit = Math.min(Math.max(1, parseInt(params.get('limit') ?? '6', 10)), 12);

  try {
    const svc = getOptionsService();

    const firstChain = await svc.chain({ symbol, type: type ?? undefined });
    const allExpirations = firstChain.expirations.filter(
      (d) => new Date(d).getTime() > Date.now(),
    );

    const windowExps = allExpirations.slice(offset, offset + limit);

    const chains = await Promise.all(
      windowExps.map((exp) =>
        svc.chain({
          symbol,
          type: type ?? undefined,
          expiry: new Date(exp),
        }).catch(() => null),
      ),
    );

    const calls = [];
    const puts = [];

    for (const chain of chains) {
      if (!chain) continue;
      calls.push(...chain.calls);
      puts.push(...chain.puts);
    }

    return NextResponse.json({
      underlying: symbol,
      underlyingPrice: firstChain.underlyingPrice,
      allExpirations,
      expirations: windowExps,
      calls,
      puts,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
