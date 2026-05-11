import { Command } from 'commander';
import { getService } from '../provider.js';
import { formatQuote } from '../format.js';

export const quoteCommand = new Command('quote')
  .description('Get stock quote(s)')
  .argument('<symbols...>', 'ticker symbol(s)')
  .action(async (symbols: string[]) => {
    const svc = await getService();
    const quotes = await svc.quotes(symbols);

    for (const q of quotes) {
      console.log(formatQuote(q));
      if (quotes.length > 1) console.log();
    }
  });
