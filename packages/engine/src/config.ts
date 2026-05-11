import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { SchwabTokens, SchwabTokenStore, SchwabCredentials } from './providers/schwab.js';

const CONFIG_DIR = join(homedir(), '.inktrade');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const TOKENS_FILE = join(CONFIG_DIR, 'schwab-tokens.json');

export type ProviderType = 'yahoo' | 'schwab';

export interface InktradeConfig {
  provider: ProviderType;
  schwab?: SchwabCredentials;
}

const DEFAULT_CONFIG: InktradeConfig = {
  provider: 'yahoo',
};

async function ensureDir(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
}

export async function loadConfig(): Promise<InktradeConfig> {
  try {
    const raw = await readFile(CONFIG_FILE, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(config: InktradeConfig): Promise<void> {
  await ensureDir();
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n');
}

export class FileTokenStore implements SchwabTokenStore {
  async load(): Promise<SchwabTokens | null> {
    try {
      const raw = await readFile(TOKENS_FILE, 'utf-8');
      return JSON.parse(raw) as SchwabTokens;
    } catch {
      return null;
    }
  }

  async save(tokens: SchwabTokens): Promise<void> {
    await ensureDir();
    await writeFile(TOKENS_FILE, JSON.stringify(tokens, null, 2) + '\n');
  }
}
