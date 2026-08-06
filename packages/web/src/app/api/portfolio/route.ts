import { NextRequest, NextResponse } from 'next/server';
import { robinhoodBroker } from '@/lib/robinhood';

/**
 * The portfolio, in Inktrade's own shape.
 *
 * This is the seam the apps bind to. Robinhood happens to speak MCP, Schwab
 * speaks REST, and the mock speaks neither — all three arrive here as a
 * PortfolioSummary, so web and mobile render our visualizations against one
 * contract and never learn which brokerage produced the numbers.
 */
export async function GET(request: NextRequest) {
  try {
    const broker = await robinhoodBroker(request.url);
    if (!broker) {
      return NextResponse.json(
        { error: 'No brokerage is linked', status: 'disconnected' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      provider: broker.name,
      isMock: broker.isMock,
      summary: await broker.getPortfolio(),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
