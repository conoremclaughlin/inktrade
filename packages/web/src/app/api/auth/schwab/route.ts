import { NextRequest, NextResponse } from 'next/server';
import { loadConfig, saveConfig, createTokenStore } from '@inktrade/engine/config';
import { SchwabMarketService } from '@inktrade/engine/services';

export async function GET() {
  const config = await loadConfig();
  const tokenStore = createTokenStore();
  const tokens = await tokenStore.load();

  const hasCredentials = !!(config.schwab?.appKey && config.schwab?.appSecret);
  const hasTokens = !!tokens;
  const tokenExpired = tokens ? Date.now() >= tokens.refreshExpiresAt : false;

  if (!hasCredentials) {
    return NextResponse.json({
      status: 'unconfigured',
      message: 'Schwab app credentials not configured',
    });
  }

  if (hasTokens && !tokenExpired) {
    return NextResponse.json({
      status: 'connected',
      provider: config.provider,
      tokenExpiresAt: tokens!.expiresAt,
      refreshExpiresAt: tokens!.refreshExpiresAt,
    });
  }

  const service = new SchwabMarketService(config.schwab!, tokenStore);
  const authUrl = service.getAuthorizationUrl();

  return NextResponse.json({
    status: tokenExpired ? 'expired' : 'disconnected',
    authUrl,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { appKey, appSecret, redirectUri } = body;

  if (!appKey || !appSecret) {
    return NextResponse.json({ error: 'appKey and appSecret are required' }, { status: 400 });
  }

  const config = await loadConfig();
  config.schwab = {
    appKey,
    appSecret,
    redirectUri: redirectUri || 'https://127.0.0.1:6001/api/auth/schwab/callback',
  };
  await saveConfig(config);

  const tokenStore = createTokenStore();
  const service = new SchwabMarketService(config.schwab, tokenStore);
  const authUrl = service.getAuthorizationUrl();

  return NextResponse.json({
    status: 'configured',
    authUrl,
  });
}

export async function DELETE() {
  const config = await loadConfig();
  const tokenStore = createTokenStore();

  try {
    await tokenStore.save({
      accessToken: '',
      refreshToken: '',
      expiresAt: 0,
      refreshExpiresAt: 0,
    });
  } catch {
    // Token store may not exist yet
  }

  if (config.provider === 'schwab') {
    config.provider = 'yahoo';
    await saveConfig(config);
  }

  return NextResponse.json({ status: 'disconnected' });
}
