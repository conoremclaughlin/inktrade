import { NextRequest, NextResponse } from 'next/server';
import { getOptionsService } from '@/lib/engine';

function computeHistoricalVolatility(closes: number[], window: number): number[] {
  const hvs: number[] = [];
  for (let i = window; i < closes.length; i++) {
    const returns: number[] = [];
    for (let j = i - window + 1; j <= i; j++) {
      if (closes[j - 1] > 0) {
        returns.push(Math.log(closes[j] / closes[j - 1]));
      }
    }
    if (returns.length < 2) {
      hvs.push(0);
      continue;
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
    hvs.push(Math.sqrt(variance * 252));
  }
  return hvs;
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol');
  if (!symbol) {
    return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
  }

  try {
    const svc = getOptionsService();
    const bars = await svc.history(symbol, '1y');

    if (bars.length < 30) {
      return NextResponse.json({ error: 'Insufficient price history' }, { status: 400 });
    }

    const closes = bars.map((b) => b.close);
    const timestamps = bars.map((b) => b.timestamp);

    const hv20 = computeHistoricalVolatility(closes, 20);
    const hv60 = computeHistoricalVolatility(closes, 60);

    const series = [];
    const offset20 = closes.length - hv20.length;
    const offset60 = closes.length - hv60.length;

    for (let i = 0; i < closes.length; i++) {
      series.push({
        timestamp: timestamps[i],
        close: closes[i],
        hv20: i >= offset20 ? hv20[i - offset20] : null,
        hv60: i >= offset60 ? hv60[i - offset60] : null,
      });
    }

    const latestHv20 = hv20[hv20.length - 1] ?? 0;
    const latestHv60 = hv60[hv60.length - 1] ?? 0;

    const sortedHv = [...hv20].sort((a, b) => a - b);
    const hvPercentileRank = sortedHv.length > 0
      ? (sortedHv.filter((v) => v <= latestHv20).length / sortedHv.length) * 100
      : 50;

    return NextResponse.json({
      series,
      latestHv20,
      latestHv60,
      hvPercentileRank,
      hvHigh: sortedHv[Math.floor(sortedHv.length * 0.95)] ?? 0,
      hvLow: sortedHv[Math.floor(sortedHv.length * 0.05)] ?? 0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
