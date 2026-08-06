import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { resolveTradingMode, type TradingMode, type TradingModeDecision } from '@inktrade/client';

const SETTINGS_PATH = join(homedir(), '.inktrade', 'trading.json');

/**
 * The trading-mode decision, made server-side.
 *
 * This is the enforcement point. The UI reads the same decision to explain
 * itself, but a client that ignores it must still be unable to place an order
 * — a kill switch that only hides a button is not a kill switch.
 */
export async function tradingMode(): Promise<TradingModeDecision> {
  return resolveTradingMode({
    env: process.env.INKTRADE_REVIEW_ONLY,
    setting: await readSetting(),
  });
}

async function readSetting(): Promise<TradingMode | null> {
  try {
    const parsed = JSON.parse(await readFile(SETTINGS_PATH, 'utf8')) as { mode?: TradingMode };
    return parsed.mode === 'REVIEW_ONLY' || parsed.mode === 'ENABLED' ? parsed.mode : null;
  } catch {
    // No file yet, or unreadable. Absent is not review-only — the default is
    // decided by resolveTradingMode, in one place.
    return null;
  }
}

export async function saveTradingModeSetting(mode: TradingMode): Promise<void> {
  await mkdir(dirname(SETTINGS_PATH), { recursive: true });
  await writeFile(SETTINGS_PATH, JSON.stringify({ mode }, null, 2), { mode: 0o600 });
}
