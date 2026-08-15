import { NextRequest, NextResponse } from 'next/server';
import {
  loadConfig,
  saveConfig,
  createTokenStore,
  resolveSchwabCredentials,
  hasValidTokens,
  DEFAULT_REDIRECT_URI,
} from '@inktrade/engine/config';
import { SchwabMarketService } from '@inktrade/engine/services';

export async function GET() {
  const config = await loadConfig();
  const resolved = resolveSchwabCredentials(config);

  if (!resolved) {
    return NextResponse.json({
      status: 'unconfigured',
      message: 'Schwab app credentials not configured',
    });
  }

  const tokenStore = createTokenStore();
  const tokens = await tokenStore.load();
  const hasTokens = hasValidTokens(tokens);
  const tokenExpired = hasTokens && Date.now() >= tokens.refreshExpiresAt;

  if (hasTokens && !tokenExpired) {
    return NextResponse.json({
      status: 'connected',
      provider: config.provider,
      credentialSource: resolved.source,
      tokenExpiresAt: tokens.expiresAt,
      refreshExpiresAt: tokens.refreshExpiresAt,
    });
  }

  const service = new SchwabMarketService(resolved.credentials, tokenStore);

  return NextResponse.json({
    status: tokenExpired ? 'expired' : 'disconnected',
    credentialSource: resolved.source,
    redirectUri: resolved.credentials.redirectUri,
    authUrl: service.getAuthorizationUrl(),
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
    redirectUri: redirectUri || DEFAULT_REDIRECT_URI,
  };
  await saveConfig(config);

  const tokenStore = createTokenStore();
  const service = new SchwabMarketService(config.schwab, tokenStore);

  return NextResponse.json({
    status: 'configured',
    credentialSource: 'config',
    authUrl: service.getAuthorizationUrl(),
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
