import { Command } from 'commander';
import { getProvider } from '../provider.js';
import { formatChainTable } from '../format.js';
import type { OptionChainQuery, OptionType } from '@inktrade/core';

export const chainCommand = new Command('chain')
  .description('Get options chain for a symbol')
  .argument('<symbol>', 'ticker symbol')
  .option('-t, --type <type>', 'call or put', undefined)
  .option('-e, --expiry <date>', 'expiration date (YYYY-MM-DD)')
  .option('--min-strike <price>', 'minimum strike price')
  .option('--max-strike <price>', 'maximum strike price')
  .option('-n, --count <number>', 'number of strikes around ATM', '10')
  .action(async (symbol: string, opts) => {
    const provider = getProvider();

    const query: OptionChainQuery = {
      symbol: symbol.toUpperCase(),
      strikeCount: parseInt(opts.count, 10),
    };

    if (opts.type) {
      query.type = opts.type.toLowerCase() as OptionType;
    }

    if (opts.expiry) {
      query.expiration = new Date(opts.expiry);
    }

    if (opts.minStrike || opts.maxStrike) {
      query.strikeRange = {
        min: opts.minStrike ? parseFloat(opts.minStrike) : 0,
        max: opts.maxStrike ? parseFloat(opts.maxStrike) : Infinity,
      };
    }

    const chain = await provider.getOptionChain(query);

    console.log(`\x1b[1m${chain.underlying}\x1b[0m  $${chain.underlyingPrice.toFixed(2)}`);
    console.log(`\x1b[2mExpirations: ${chain.expirations.map((d) => d.toISOString().slice(0, 10)).join(', ')}\x1b[0m`);
    console.log();

    if (chain.calls.length > 0) {
      console.log('\x1b[32m--- CALLS ---\x1b[0m');
      console.log(formatChainTable(chain.calls));
      console.log();
    }

    if (chain.puts.length > 0) {
      console.log('\x1b[31m--- PUTS ---\x1b[0m');
      console.log(formatChainTable(chain.puts));
    }
  });
