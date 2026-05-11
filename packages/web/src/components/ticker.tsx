const tickers = [
  { sym: 'SPY', strike: '540C', exp: '06/20', lev: '+4.2x', pnl: '+12.8%', up: true },
  { sym: 'NVDA', strike: '130C', exp: '07/18', lev: '+6.8x', pnl: '+34.2%', up: true },
  { sym: 'AAPL', strike: '195P', exp: '06/13', lev: '-3.1x', pnl: '-8.4%', up: false },
  { sym: 'TSLA', strike: '280C', exp: '07/25', lev: '+8.5x', pnl: '+52.1%', up: true },
  { sym: 'QQQ', strike: '470P', exp: '06/20', lev: '-2.9x', pnl: '-5.7%', up: false },
  { sym: 'AMZN', strike: '200C', exp: '08/15', lev: '+5.3x', pnl: '+21.6%', up: true },
  { sym: 'META', strike: '510C', exp: '07/11', lev: '+7.1x', pnl: '+28.9%', up: true },
  { sym: 'MSFT', strike: '440P', exp: '06/27', lev: '-4.0x', pnl: '-11.2%', up: false },
];

function TickerItem({ sym, strike, lev, pnl, up }: (typeof tickers)[number]) {
  return (
    <div className="flex items-center gap-3 px-6 py-3 border-r border-border-subtle whitespace-nowrap">
      <span className="text-[13px] font-semibold text-text-primary tracking-tight font-mono">
        {sym}
      </span>
      <span className="text-[12px] text-text-tertiary font-mono">{strike}</span>
      <span className="text-[12px] font-mono text-accent-bright">{lev}</span>
      <span
        className={`text-[12px] font-mono font-medium ${up ? 'text-emerald' : 'text-rose'}`}
      >
        {pnl}
      </span>
    </div>
  );
}

export function Ticker() {
  return (
    <div className="relative border-y border-border-subtle bg-abyss/80 overflow-hidden">
      {/* Fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-abyss to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-abyss to-transparent z-10 pointer-events-none" />

      <div className="ticker-track">
        {/* Duplicate for seamless loop */}
        {[...tickers, ...tickers].map((t, i) => (
          <TickerItem key={i} {...t} />
        ))}
      </div>
    </div>
  );
}
