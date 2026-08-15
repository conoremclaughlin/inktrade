import { NextRequest, NextResponse } from 'next/server';
import { getOptionsService } from '@/lib/engine';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const symbol = params.get('symbol')?.toUpperCase();
  const expiry = params.get('expiry');

  if (!symbol) {
    return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
  }

  try {
    const svc = getOptionsService();
    const chain = await svc.chain({
      symbol,
      expiry: expiry ?? undefined,
      strikeCount: 60,
    });

    const strikeMap = new Map<number, {
      strike: number;
      callOI: number;
      putOI: number;
      callVolume: number;
      putVolume: number;
    }>();

    for (const c of chain.calls) {
      const existing = strikeMap.get(c.strike) ?? {
        strike: c.strike, callOI: 0, putOI: 0, callVolume: 0, putVolume: 0,
      };
      existing.callOI += c.openInterest;
      existing.callVolume += c.volume;
      strikeMap.set(c.strike, existing);
    }

    for (const p of chain.puts) {
      const existing = strikeMap.get(p.strike) ?? {
        strike: p.strike, callOI: 0, putOI: 0, callVolume: 0, putVolume: 0,
      };
      existing.putOI += p.openInterest;
      existing.putVolume += p.volume;
      strikeMap.set(p.strike, existing);
    }

    const strikes = [...strikeMap.values()].sort((a, b) => a.strike - b.strike);

    // Max pain: strike where total dollar value of expired options is maximized for writers
    let maxPainStrike = 0;
    let minPain = Infinity;
    for (const s of strikes) {
      let pain = 0;
      for (const other of strikes) {
        if (other.strike < s.strike) {
          pain += other.putOI * (s.strike - other.strike) * 100;
        } else if (other.strike > s.strike) {
          pain += other.callOI * (other.strike - s.strike) * 100;
        }
      }
      if (pain < minPain) {
        minPain = pain;
        maxPainStrike = s.strike;
      }
    }

    const totalCallOI = strikes.reduce((sum, s) => sum + s.callOI, 0);
    const totalPutOI = strikes.reduce((sum, s) => sum + s.putOI, 0);
    const pcRatio = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;

    return NextResponse.json({
      symbol,
      underlyingPrice: chain.underlyingPrice,
      expirations: chain.expirations.map((d: Date) => d.toISOString().slice(0, 10)),
      strikes,
      maxPainStrike,
      totalCallOI,
      totalPutOI,
      pcRatio,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
