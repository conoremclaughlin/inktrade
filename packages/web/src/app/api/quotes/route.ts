import { NextRequest, NextResponse } from 'next/server';
import { getOptionsService } from '@/lib/engine';

export async function GET(request: NextRequest) {
  const symbols = request.nextUrl.searchParams.get('symbols');
  if (!symbols) {
    return NextResponse.json({ error: 'symbols is required' }, { status: 400 });
  }

  const list = symbols.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (list.length === 0) {
    return NextResponse.json({ error: 'at least one symbol is required' }, { status: 400 });
  }
  if (list.length > 100) {
    return NextResponse.json({ error: 'max 100 symbols' }, { status: 400 });
  }

  try {
    const svc = getOptionsService();
    const quotes = await svc.quotes(list);
    return NextResponse.json({ quotes });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
