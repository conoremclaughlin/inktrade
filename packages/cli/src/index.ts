#!/usr/bin/env node

import { Command } from 'commander';
import { quoteCommand } from './commands/quote.js';
import { chainCommand } from './commands/chain.js';
import { leverageCommand } from './commands/leverage.js';

const program = new Command()
  .name('inktrade')
  .description('Options leverage intelligence from the terminal')
  .version('0.1.0');

program.addCommand(quoteCommand);
program.addCommand(chainCommand);
program.addCommand(leverageCommand);

program.parseAsync().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
