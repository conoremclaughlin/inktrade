import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol');
  if (!symbol) {
    return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
  }

  try {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    const [timeSeries, summary] = await Promise.all([
      yf.fundamentalsTimeSeries(symbol, {
        period1: twoYearsAgo.toISOString().slice(0, 10),
        type: 'quarterly',
        module: 'all',
      }),
      yf.quoteSummary(symbol, {
        modules: ['defaultKeyStatistics', 'price', 'calendarEvents', 'earningsTrend'],
      }),
    ]);

    const sharesOutstanding =
      summary.defaultKeyStatistics?.sharesOutstanding ?? 0;
    const marketCap = summary.price?.marketCap ?? 0;
    const trailingEps = summary.defaultKeyStatistics?.trailingEps ?? 0;
    const currentPrice = summary.price?.regularMarketPrice ?? 0;

    const earningsDate =
      summary.calendarEvents?.earnings?.earningsDate?.[0] instanceof Date
        ? summary.calendarEvents.earnings.earningsDate[0].toISOString()
        : null;

    const trends = summary.earningsTrend?.trend ?? [];
    const nextQuarterTrend = trends.find((t) => t.period === '0q');
    const currentFyTrend = trends.find((t) => t.period === '0y');
    const nextFyTrend = trends.find((t) => t.period === '+1y');

    const currentFyEps = currentFyTrend?.earningsEstimate?.avg ?? 0;
    const nextFyEps = nextFyTrend?.earningsEstimate?.avg ?? 0;

    const quarters = timeSeries
      .filter((q) => q.date && (q as Record<string, unknown>).totalRevenue)
      .map((q) => {
        const r = q as Record<string, unknown>;
        const endDate =
          q.date instanceof Date
            ? q.date.toISOString().slice(0, 10)
            : String(q.date ?? '');
        const revenue = Number(r.totalRevenue ?? 0);
        const grossProfit = Number(r.grossProfit ?? 0);
        const costOfRevenue = Number(r.costOfRevenue ?? 0);
        const operatingIncome = Number(r.operatingIncome ?? 0);
        const netIncome = Number(r.netIncomeCommonStockholders ?? r.netIncome ?? 0);
        const eps = Number(r.dilutedEPS ?? r.basicEPS ?? 0);
        const resolvedGross = grossProfit || (revenue - costOfRevenue);
        const grossMarginPct = revenue > 0 ? (resolvedGross / revenue) * 100 : 0;

        const freeCashFlow = Number(r.freeCashFlow ?? 0);

        const totalAssets = Number(r.totalAssets ?? 0);
        const totalDebt = Number(r.totalDebt ?? 0);
        const totalEquity = Number(r.stockholdersEquity ?? r.totalEquityGrossMinorityInterest ?? 0);
        const cash = Number(r.cashAndCashEquivalents ?? 0);
        const currentAssets = Number(r.currentAssets ?? 0);
        const currentLiabilities = Number(r.currentLiabilities ?? 0);

        return {
          endDate, revenue, grossProfit: resolvedGross, operatingIncome,
          netIncome, grossMarginPct, eps, freeCashFlow,
          totalAssets, totalDebt, totalEquity, cash,
          currentAssets, currentLiabilities,
        };
      })
      .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())
      .slice(-6);

    const trailingPe = trailingEps > 0 ? currentPrice / trailingEps : null;
    const currentFyPe = currentFyEps > 0 ? currentPrice / currentFyEps : null;
    const nextFyPe = nextFyEps > 0 ? currentPrice / nextFyEps : null;

    const earnings = {
      nextDate: earningsDate,
      isEstimate: summary.calendarEvents?.earnings?.isEarningsDateEstimate ?? true,
      epsEstimate: nextQuarterTrend?.earningsEstimate
        ? {
            avg: nextQuarterTrend.earningsEstimate.avg,
            low: nextQuarterTrend.earningsEstimate.low,
            high: nextQuarterTrend.earningsEstimate.high,
            yearAgoEps: nextQuarterTrend.earningsEstimate.yearAgoEps,
            analysts: nextQuarterTrend.earningsEstimate.numberOfAnalysts,
          }
        : null,
      revenueEstimate: nextQuarterTrend?.revenueEstimate
        ? {
            avg: nextQuarterTrend.revenueEstimate.avg,
            low: nextQuarterTrend.revenueEstimate.low,
            high: nextQuarterTrend.revenueEstimate.high,
            analysts: nextQuarterTrend.revenueEstimate.numberOfAnalysts,
          }
        : null,
    };

    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      sharesOutstanding,
      marketCap,
      trailingEps,
      currentFyEps,
      nextFyEps,
      trailingPe,
      currentFyPe,
      nextFyPe,
      currentFyGrowth: currentFyTrend?.earningsEstimate?.growth ?? null,
      nextFyGrowth: nextFyTrend?.earningsEstimate?.growth ?? null,
      quarters,
      earnings,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
