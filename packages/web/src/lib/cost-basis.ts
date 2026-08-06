import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import {
  COST_BASIS_STRATEGIES,
  resolveCostBasisStrategy,
  type CostBasisDecision,
  type CostBasisStrategy,
} from '@inktrade/client';

const SETTINGS_PATH = join(homedir(), '.inktrade', 'cost-basis.json');

/**
 * Which cost-basis strategy a sale uses, decided server-side.
 *
 * Server-side because this is not a display preference — it changes which
 * shares actually leave the account, and therefore what gets reported to the
 * IRS. A client that forgot to send it must still get the user's strategy, not
 * the broker's FIFO.
 */
export async function costBasisStrategy(): Promise<CostBasisDecision> {
  return resolveCostBasisStrategy({
    env: process.env.INKTRADE_COST_BASIS,
    setting: await readSetting(),
  });
}

async function readSetting(): Promise<CostBasisStrategy | null> {
  try {
    const parsed = JSON.parse(await readFile(SETTINGS_PATH, 'utf8')) as {
      strategy?: CostBasisStrategy;
    };
    return parsed.strategy && COST_BASIS_STRATEGIES.includes(parsed.strategy)
      ? parsed.strategy
      : null;
  } catch {
    // No file yet, or unreadable. The default lives in resolveCostBasisStrategy,
    // in one place, rather than being re-decided here.
    return null;
  }
}

export async function saveCostBasisSetting(strategy: CostBasisStrategy): Promise<void> {
  await mkdir(dirname(SETTINGS_PATH), { recursive: true });
  await writeFile(SETTINGS_PATH, JSON.stringify({ strategy }, null, 2), { mode: 0o600 });
}
