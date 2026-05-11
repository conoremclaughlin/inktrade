import { Command } from 'commander';
import { getProvider } from '../provider.js';
import { formatQuote } from '../format.js';

export const quoteCommand = new Command('quote')
  .description('Get stock quote(s)')
  .argument('<symbols...>', 'ticker symbol(s)')
  .action(async (symbols: string[]) => {
    const provider = getProvider();
    const quotes = await provider.getQuotes(symbols.map((s) => s.toUpperCase()));

    for (const q of quotes) {
      console.log(formatQuote(q));
      if (quotes.length > 1) console.log();
    }
  });
