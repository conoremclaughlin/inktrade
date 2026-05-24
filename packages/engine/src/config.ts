import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { SchwabTokens, SchwabTokenStore, SchwabCredentials } from './services/schwab.js';

const execFileAsync = promisify(execFile);

const CONFIG_DIR = join(homedir(), '.inktrade');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const KEYCHAIN_SERVICE = 'com.inktrade.schwab';
const KEYCHAIN_ACCOUNT = 'schwab-tokens';

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

export class KeychainTokenStore implements SchwabTokenStore {
  async load(): Promise<SchwabTokens | null> {
    try {
      const { stdout } = await execFileAsync('security', [
        'find-generic-password',
        '-s', KEYCHAIN_SERVICE,
        '-a', KEYCHAIN_ACCOUNT,
        '-w',
      ]);
      return JSON.parse(stdout.trim()) as SchwabTokens;
    } catch {
      return null;
    }
  }

  async save(tokens: SchwabTokens): Promise<void> {
    const data = JSON.stringify(tokens);
    try {
      await execFileAsync('security', [
        'delete-generic-password',
        '-s', KEYCHAIN_SERVICE,
        '-a', KEYCHAIN_ACCOUNT,
      ]);
    } catch {
      // Key doesn't exist yet — that's fine
    }
    await execFileAsync('security', [
      'add-generic-password',
      '-s', KEYCHAIN_SERVICE,
      '-a', KEYCHAIN_ACCOUNT,
      '-w', data,
      '-U',
    ]);
  }
}

export class FileTokenStore implements SchwabTokenStore {
  async load(): Promise<SchwabTokens | null> {
    try {
      const raw = await readFile(join(CONFIG_DIR, 'schwab-tokens.json'), 'utf-8');
      return JSON.parse(raw) as SchwabTokens;
    } catch {
      return null;
    }
  }

  async save(tokens: SchwabTokens): Promise<void> {
    await ensureDir();
    await writeFile(join(CONFIG_DIR, 'schwab-tokens.json'), JSON.stringify(tokens, null, 2) + '\n');
  }
}

export function createTokenStore(): SchwabTokenStore {
  if (process.platform === 'darwin') {
    return new KeychainTokenStore();
  }
  return new FileTokenStore();
}
