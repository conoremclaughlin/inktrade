import { Command } from 'commander';
import { getProvider } from '../provider.js';
import { analyzeLeverage, type LeverageAnalysisParams } from '@inktrade/core';
import { formatLeverageAnalysis, formatContract } from '../format.js';
import type { OptionType } from '@inktrade/core';

export const leverageCommand = new Command('leverage')
  .description('Analyze leverage for an options position')
  .argument('<symbol>', 'underlying ticker')
  .argument('<strike>', 'strike price')
  .argument('<type>', 'call or put')
  .option('-e, --expiry <date>', 'expiration date (YYYY-MM-DD)')
  .option(
    '-t, --targets <prices>',
    'comma-separated target prices for scenario analysis',
  )
  .option(
    '-r, --range <percent>',
    'price range as % from current price (default: 20)',
    '20',
  )
  .action(async (symbol: string, strikeStr: string, type: string, opts) => {
    const provider = getProvider();
    const sym = symbol.toUpperCase();
    const strike = parseFloat(strikeStr);
    const optType = type.toLowerCase() as OptionType;

    const chain = await provider.getOptionChain({
      symbol: sym,
      type: optType,
      expiration: opts.expiry ? new Date(opts.expiry) : undefined,
    });

    const contracts = optType === 'call' ? chain.calls : chain.puts;
    const contract = contracts.reduce((best, c) => {
      if (!best) return c;
      return Math.abs(c.strike - strike) < Math.abs(best.strike - strike) ? c : best;
    }, contracts[0]);

    if (!contract) {
      console.error(`No ${type} contract found near $${strike} for ${sym}`);
      process.exit(1);
    }

    console.log(formatContract(contract));
    console.log();

    const rangePct = parseFloat(opts.range) / 100;
    const targets = opts.targets
      ? opts.targets.split(',').map((p: string) => ({ price: parseFloat(p.trim()) }))
      : [
          { price: chain.underlyingPrice * 1.05 },
          { price: chain.underlyingPrice * 1.1 },
          { price: chain.underlyingPrice * 1.15 },
          { price: chain.underlyingPrice * 1.2 },
        ];

    const params: LeverageAnalysisParams = {
      underlying: sym,
      underlyingPrice: chain.underlyingPrice,
      contract,
      targets,
      priceRange: {
        min: chain.underlyingPrice * (1 - rangePct),
        max: chain.underlyingPrice * (1 + rangePct),
      },
    };

    const analysis = analyzeLeverage(params);

    console.log(formatLeverageAnalysis(analysis));
  });
