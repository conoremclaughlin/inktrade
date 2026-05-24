import { NextRequest, NextResponse } from 'next/server';
import { getOptionsService } from '@/lib/engine';

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol');
  if (!symbol) {
    return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
  }

  try {
    const svc = getOptionsService();
    const quote = await svc.quote(symbol);
    return NextResponse.json(quote);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
