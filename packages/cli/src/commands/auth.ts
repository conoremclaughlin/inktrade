import { Command } from 'commander';
import {
  loadConfig,
  SchwabProvider,
  FileTokenStore,
  resetProvider,
} from '@inktrade/engine';

export const authCommand = new Command('auth')
  .description('Authenticate with a market data provider');

authCommand
  .command('schwab')
  .description('Authenticate with Schwab (OAuth 2.0)')
  .option('--code <code>', 'Authorization code from redirect URL')
  .action(async (opts) => {
    const config = await loadConfig();

    if (!config.schwab) {
      console.error(
        'Schwab not configured. Run: inktrade config schwab --app-key <key> --app-secret <secret>',
      );
      process.exit(1);
    }

    const provider = new SchwabProvider(config.schwab, new FileTokenStore());

    if (!opts.code) {
      const url = provider.getAuthorizationUrl();
      console.log('\x1b[1mOpen this URL in your browser to authorize:\x1b[0m\n');
      console.log(url);
      console.log(
        '\n\x1b[2mAfter authorizing, copy the "code" parameter from the redirect URL and run:\x1b[0m',
      );
      console.log('  inktrade auth schwab --code <authorization_code>');
      return;
    }

    try {
      await provider.exchangeCode(opts.code);
      resetProvider();
      console.log('\x1b[32mSchwab authentication successful!\x1b[0m');
      console.log('\x1b[2mTokens saved to ~/.inktrade/schwab-tokens.json\x1b[0m');
      console.log(
        '\x1b[33mNote: Refresh tokens expire after 7 days. You\'ll need to re-authenticate.\x1b[0m',
      );
    } catch (err) {
      console.error(`Authentication failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });
