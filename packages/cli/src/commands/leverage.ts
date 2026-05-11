import { Command } from 'commander';
import { getService } from '../provider.js';
import { formatLeverageAnalysis } from '../format.js';
import type { OptionType } from '@inktrade/engine';

export const leverageCommand = new Command('leverage')
  .description('Analyze leverage for an options position')
  .argument('<symbol>', 'underlying ticker')
  .argument('<strike>', 'strike price')
  .argument('<type>', 'call or put')
  .option('-e, --expiry <date>', 'expiration date (YYYY-MM-DD)')
  .option('-t, --targets <prices>', 'comma-separated target prices for scenario analysis')
  .option('-r, --range <percent>', 'price range as % from current price (default: 20)', '20')
  .action(async (symbol: string, strikeStr: string, type: string, opts) => {
    const svc = await getService();

    const targets = opts.targets
      ? opts.targets.split(',').map((p: string) => parseFloat(p.trim()))
      : undefined;

    const analysis = await svc.leverage({
      symbol,
      strike: parseFloat(strikeStr),
      type: type.toLowerCase() as OptionType,
      expiry: opts.expiry,
      targets,
      rangePct: parseFloat(opts.range),
    });

    console.log(formatLeverageAnalysis(analysis));
  });
