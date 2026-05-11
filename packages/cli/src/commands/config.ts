import { Command } from 'commander';
import { loadConfig, saveConfig, type ProviderType } from '@inktrade/engine';

export const configCommand = new Command('config')
  .description('Manage Inktrade configuration');

configCommand
  .command('show')
  .description('Show current configuration')
  .action(async () => {
    const config = await loadConfig();
    console.log(`\x1b[1mProvider:\x1b[0m ${config.provider}`);
    if (config.schwab) {
      console.log(`\x1b[1mSchwab App Key:\x1b[0m ${config.schwab.appKey.slice(0, 8)}...`);
      console.log(`\x1b[1mSchwab Redirect:\x1b[0m ${config.schwab.redirectUri}`);
    }
  });

configCommand
  .command('provider')
  .description('Set the active market data provider')
  .argument('<name>', 'provider name (yahoo or schwab)')
  .action(async (name: string) => {
    const provider = name.toLowerCase() as ProviderType;
    if (provider !== 'yahoo' && provider !== 'schwab') {
      console.error('Provider must be "yahoo" or "schwab"');
      process.exit(1);
    }

    const config = await loadConfig();
    config.provider = provider;
    await saveConfig(config);
    console.log(`Active provider set to \x1b[1m${provider}\x1b[0m`);
  });

configCommand
  .command('schwab')
  .description('Configure Schwab API credentials')
  .requiredOption('--app-key <key>', 'Schwab app key')
  .requiredOption('--app-secret <secret>', 'Schwab app secret')
  .option('--redirect-uri <uri>', 'OAuth redirect URI', 'https://127.0.0.1:5556/callback')
  .action(async (opts) => {
    const config = await loadConfig();
    config.schwab = {
      appKey: opts.appKey,
      appSecret: opts.appSecret,
      redirectUri: opts.redirectUri,
    };
    config.provider = 'schwab';
    await saveConfig(config);
    console.log('Schwab credentials saved. Provider set to \x1b[1mschwab\x1b[0m.');
    console.log(`\x1b[2mConfig stored at ~/.inktrade/config.json\x1b[0m`);
  });
