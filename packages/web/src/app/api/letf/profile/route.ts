import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { lookupLetf } from '@inktrade/engine';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.toUpperCase();
  if (!symbol) {
    return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
  }

  const registry = lookupLetf(symbol);
  if (!registry) {
    return NextResponse.json(
      { error: `${symbol} is not a recognized leveraged ETF` },
      { status: 404 },
    );
  }

  try {
    const summary = await yf.quoteSummary(symbol, {
      modules: ['fundProfile', 'defaultKeyStatistics', 'price', 'summaryDetail'],
    });

    // fundPerformance has schema validation issues for LETFs (missing risk fields)
    let perf: Record<string, unknown> | null = null;
    try {
      const perfResult = await yf.quoteSummary(symbol, {
        modules: ['fundPerformance'],
      });
      perf = perfResult.fundPerformance as Record<string, unknown> | null;
    } catch {
      // Yahoo returns incomplete risk stats for many LETFs — degrade gracefully
    }

    const price = summary.price;
    const stats = summary.defaultKeyStatistics;
    const profile = summary.fundProfile;

    const trailing = (perf?.trailingReturns ?? {}) as Record<string, number | null>;
    const riskStats = (perf?.riskOverviewStatistics as Record<string, unknown[]> | undefined)
      ?.riskStatistics as Array<Record<string, unknown>> | undefined;
    const riskRow = riskStats?.find(
      (r) => r.year === '3y' || r.year === '5y',
    );

    return NextResponse.json({
      registry,
      expenseRatio: profile?.feesExpensesInvestment?.annualReportExpenseRatio
        ?? profile?.feesExpensesInvestment?.netExpRatio
        ?? stats?.annualReportExpenseRatio
        ?? null,
      totalAssets: summary.summaryDetail?.totalAssets ?? stats?.totalAssets ?? null,
      inceptionDate: stats?.fundInceptionDate
        ? (stats.fundInceptionDate instanceof Date
          ? stats.fundInceptionDate.toISOString().slice(0, 10)
          : String(stats.fundInceptionDate))
        : null,
      ytdReturn: stats?.ytdReturn ?? null,
      beta: stats?.beta ?? stats?.beta3Year ?? null,
      fundFamily: profile?.family ?? null,
      categoryName: profile?.categoryName ?? null,
      price: price?.regularMarketPrice ?? 0,
      change: price?.regularMarketChange ?? 0,
      changePercent: price?.regularMarketChangePercent
        ? price.regularMarketChangePercent * 100
        : 0,
      trailingReturns: {
        oneMonth: trailing.oneMonth ?? null,
        threeMonth: trailing.threeMonth ?? null,
        oneYear: trailing.oneYear ?? null,
        threeYear: trailing.threeYear ?? null,
        fiveYear: trailing.fiveYear ?? null,
      },
      riskStats: riskRow
        ? {
            alpha: (riskRow.alpha as number) ?? 0,
            beta: (riskRow.beta as number) ?? 0,
            stdDev: (riskRow.stdDev as number) ?? 0,
            sharpeRatio: (riskRow.sharpeRatio as number) ?? 0,
          }
        : null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
