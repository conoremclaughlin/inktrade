import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const DEFAULT_WATCHLIST = [
  'SPY', 'QQQ', 'IWM', 'VIX',
  'NVDA', 'AMD', 'AVGO', 'TSM',
  'AAPL', 'GOOG', 'AMZN', 'MSFT', 'TSLA',
  'SOXL', 'NFLX', 'NET',
];

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: watchlist } = await supabase
    .from('watchlists')
    .select('symbols')
    .eq('user_id', user.id)
    .single();

  if (watchlist) {
    return NextResponse.json({ symbols: watchlist.symbols });
  }

  const { data: created } = await supabase
    .from('watchlists')
    .insert({ user_id: user.id, symbols: DEFAULT_WATCHLIST })
    .select('symbols')
    .single();

  return NextResponse.json({ symbols: created?.symbols ?? DEFAULT_WATCHLIST });
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();

  if (!Array.isArray(body.symbols) || body.symbols.some((s: unknown) => typeof s !== 'string')) {
    return NextResponse.json({ error: 'symbols must be a string array' }, { status: 400 });
  }

  const cleaned = [...new Set(
    (body.symbols as string[]).map((s) => s.toUpperCase().trim()).filter(Boolean)
  )].slice(0, 100);

  const { data, error } = await supabase
    .from('watchlists')
    .upsert({ user_id: user.id, symbols: cleaned }, { onConflict: 'user_id' })
    .select('symbols')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ symbols: data.symbols });
}
