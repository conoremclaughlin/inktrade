import type { Quote, OptionContract, OptionGreeks } from '@inktrade/engine';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function sign(n: number): string {
  return n >= 0 ? '+' : '';
}

function color(n: number): string {
  return n >= 0 ? GREEN : RED;
}

export function formatQuote(q: Quote): string {
  const c = color(q.change);
  const lines = [
    `${BOLD}${q.symbol}${RESET}  ${BOLD}$${q.price.toFixed(2)}${RESET}  ${c}${sign(q.change)}${q.change.toFixed(2)} (${sign(q.changePercent)}${q.changePercent.toFixed(2)}%)${RESET}`,
    `${DIM}Open${RESET} $${q.open.toFixed(2)}  ${DIM}High${RESET} $${q.high.toFixed(2)}  ${DIM}Low${RESET} $${q.low.toFixed(2)}  ${DIM}Prev Close${RESET} $${q.previousClose.toFixed(2)}`,
    `${DIM}Volume${RESET} ${q.volume.toLocaleString()}${q.marketCap ? `  ${DIM}Mkt Cap${RESET} $${(q.marketCap / 1e9).toFixed(1)}B` : ''}`,
  ];
  return lines.join('\n');
}

export function formatGreeks(g: OptionGreeks): string {
  return [
    `${CYAN}Δ${RESET} ${g.delta.toFixed(3)}`,
    `${CYAN}Γ${RESET} ${g.gamma.toFixed(4)}`,
    `${YELLOW}Θ${RESET} ${g.theta.toFixed(3)}`,
    `${CYAN}ν${RESET} ${g.vega.toFixed(3)}`,
    `${DIM}ρ${RESET} ${g.rho.toFixed(3)}`,
    `${DIM}IV${RESET} ${(g.impliedVolatility * 100).toFixed(1)}%`,
  ].join('  ');
}

export function formatContract(c: OptionContract): string {
  const typeLabel = c.type === 'call' ? `${GREEN}C${RESET}` : `${RED}P${RESET}`;
  const exp = c.expiration.toISOString().slice(0, 10);
  const itm = c.inTheMoney ? `${BOLD}ITM${RESET}` : `${DIM}OTM${RESET}`;

  return [
    `${BOLD}$${c.strike}${RESET} ${typeLabel}  ${exp}  ${itm}  ${DIM}DTE${RESET} ${c.daysToExpiration}`,
    `${DIM}Bid${RESET} $${c.bid.toFixed(2)}  ${DIM}Ask${RESET} $${c.ask.toFixed(2)}  ${DIM}Mark${RESET} $${c.mark.toFixed(2)}  ${DIM}Vol${RESET} ${c.volume.toLocaleString()}  ${DIM}OI${RESET} ${c.openInterest.toLocaleString()}`,
    formatGreeks(c.greeks),
  ].join('\n');
}

export function formatChainTable(contracts: OptionContract[]): string {
  if (contracts.length === 0) return `${DIM}No contracts found${RESET}`;

  const header = `${DIM}${'Strike'.padEnd(10)}${'Type'.padEnd(6)}${'Bid'.padEnd(10)}${'Ask'.padEnd(10)}${'Mark'.padEnd(10)}${'Vol'.padEnd(10)}${'OI'.padEnd(10)}${'Δ'.padEnd(8)}${'Γ'.padEnd(8)}${'Θ'.padEnd(8)}${'IV'.padEnd(8)}${'DTE'.padEnd(6)}${RESET}`;

  const rows = contracts.map((c) => {
    const typeColor = c.type === 'call' ? GREEN : RED;
    const itmBg = c.inTheMoney ? BOLD : '';
    return `${itmBg}$${c.strike.toFixed(2).padEnd(9)}${RESET} ${typeColor}${c.type.toUpperCase().padEnd(5)}${RESET} $${c.bid.toFixed(2).padEnd(9)} $${c.ask.toFixed(2).padEnd(9)} $${c.mark.toFixed(2).padEnd(9)} ${String(c.volume).padEnd(9)} ${String(c.openInterest).padEnd(9)} ${c.greeks.delta.toFixed(3).padEnd(7)} ${c.greeks.gamma.toFixed(4).padEnd(7)} ${c.greeks.theta.toFixed(3).padEnd(7)} ${(c.greeks.impliedVolatility * 100).toFixed(1).padEnd(7)}% ${String(c.daysToExpiration).padEnd(5)}`;
  });

  return [header, ...rows].join('\n');
}

export function formatLeverageAnalysis(
  analysis: { maxLeverage: number; breakeven: number; maxRisk: number; scenarios: Array<{ targetPrice: number; leverage: number; pnl: number; pnlPercent: number; probability?: number }> },
): string {
  const lines = [
    `${BOLD}Leverage Analysis${RESET}`,
    `${DIM}Max Leverage${RESET}  ${BOLD}${analysis.maxLeverage.toFixed(1)}x${RESET}`,
    `${DIM}Breakeven${RESET}    $${analysis.breakeven.toFixed(2)}`,
    `${DIM}Max Risk${RESET}     ${RED}$${analysis.maxRisk.toFixed(0)}${RESET} per contract`,
    '',
  ];

  if (analysis.scenarios.length > 0) {
    lines.push(`${BOLD}Scenarios${RESET}`);
    lines.push(`${DIM}${'Target'.padEnd(12)}${'Leverage'.padEnd(12)}${'P&L'.padEnd(12)}${'P&L %'.padEnd(12)}${'Prob'.padEnd(8)}${RESET}`);

    for (const s of analysis.scenarios) {
      const c = color(s.pnl);
      lines.push(
        `$${s.targetPrice.toFixed(2).padEnd(11)} ${BOLD}${s.leverage.toFixed(1)}x${RESET}`.padEnd(23) +
          ` ${c}${sign(s.pnl)}$${s.pnl.toFixed(0)}${RESET}`.padEnd(23) +
          ` ${c}${sign(s.pnlPercent)}${s.pnlPercent.toFixed(1)}%${RESET}`.padEnd(23) +
          ` ${s.probability !== undefined ? (s.probability * 100).toFixed(1) + '%' : '-'}`,
      );
    }
  }

  return lines.join('\n');
}
