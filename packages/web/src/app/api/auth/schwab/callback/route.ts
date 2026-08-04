import { NextRequest, NextResponse } from 'next/server';
import { loadConfig, saveConfig, createTokenStore, resolveSchwabCredentials } from '@inktrade/engine/config';
import { SchwabMarketService } from '@inktrade/engine/services';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/settings?error=no_code', request.url));
  }

  const config = await loadConfig();
  const resolved = resolveSchwabCredentials(config);

  if (!resolved) {
    return NextResponse.redirect(new URL('/settings?error=not_configured', request.url));
  }

  const tokenStore = createTokenStore();
  const service = new SchwabMarketService(resolved.credentials, tokenStore);

  try {
    await service.exchangeCode(code);

    config.provider = 'schwab';
    await saveConfig(config);

    return NextResponse.redirect(new URL('/settings?linked=true', request.url));
  } catch (err) {
    const message = encodeURIComponent((err as Error).message);
    return NextResponse.redirect(new URL(`/settings?error=${message}`, request.url));
  }
}
