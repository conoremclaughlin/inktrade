'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  allPositions,
  brokerIdOf,
  optionLabel,
  type BrokerWatchlist,
  type Position,
  type Quote,
} from '@inktrade/client';
import { Navbar } from '@/components/navbar';
import { AssignmentBanner } from '@/components/trade/assignment-banner';
import {
  useBrokerQuotes,
  useBrokerWatchlist,
  useBrokerWatchlists,
  usePortfolio,
} from '@/lib/broker-hooks';

/**
 * The signed-in home page.
 *
 * Ordered by what someone opening the app actually wants to know: what the
 * account is worth, then what they are watching, then what they hold. The
 * marketing page still lives at the same URL for signed-out visitors — this is
 * the same door, not a second one.
 *
 * Deliberately the same shape as the mobile Portfolio and Lists screens, and
 * built on the same query definitions from @inktrade/client, so the two stay in
 * step by construction rather than by remembering to update both.
 */
export function Dashboard() {
  const router = useRouter();
  const portfolio = usePortfolio();
  const watchlists = useBrokerWatchlists();

  const summary = portfolio.data?.summary;
  const positions = summary ? allPositions(summary) : [];
  const equities = positions.filter((p) => p.assetType !== 'OPTION');
  const options = positions.filter((p) => p.assetType === 'OPTION');
  const cash = summary?.accounts.reduce((s, a) => s + a.balances.cashBalance, 0) ?? 0;
  const buyingPower = summary?.accounts.reduce((s, a) => s + a.balances.buyingPower, 0) ?? 0;

  const lists = useMemo(
    // Empty lists last — they can't be read, so they shouldn't be in the way.
    () => [...(watchlists.data?.watchlists ?? [])].sort((a, b) => b.symbolCount - a.symbolCount),
    [watchlists.data],
  );

  const [openId, setOpenId] = useState<string | null>(null);
  // Open the largest list on arrival, so the section isn't a wall of closed rows.
  const effectiveOpenId = openId ?? lists[0]?.id ?? null;

  const goToSymbol = (symbol: string) => router.push(`/stock?symbol=${encodeURIComponent(symbol)}`);

  const notLinked = portfolio.error && watchlists.error;

  return (
    <div className="min-h-screen bg-void flex flex-col">
      <Navbar />
      <main className="flex-1 pt-16">
        <div className="mx-auto w-full max-w-6xl px-5 py-8 space-y-10">
          {notLinked ? (
            <NotLinked />
          ) : (
            <>
              <AccountOverview
                totalValue={summary?.totalValue ?? 0}
                dayChange={summary?.dayChange ?? 0}
                dayChangePercent={summary?.dayChangePercent ?? 0}
                cash={cash}
                buyingPower={buyingPower}
                loading={portfolio.isLoading}
              />

              {/*
                Above the lists: the only thing on this page with a same-day
                deadline shouldn't sit below what you're merely browsing.
              */}
              <AssignmentBanner
                positions={positions}
                broker={brokerIdOf(portfolio.data?.provider)}
              />

              <section>
                <SectionHeader title="Watchlists" count={lists.length} />
                {watchlists.isLoading && <Skeleton rows={3} />}
                {!watchlists.isLoading && lists.length === 0 && (
                  <Empty>No watchlists yet. Link a brokerage in Settings.</Empty>
                )}
                <div className="space-y-px">
                  {lists.map((list) => (
                    <WatchlistSection
                      key={list.id}
                      list={list}
                      open={effectiveOpenId === list.id}
                      onToggle={() => setOpenId(effectiveOpenId === list.id ? '' : list.id)}
                      onSymbolClick={goToSymbol}
                    />
                  ))}
                </div>
              </section>

              <section>
                <SectionHeader title="Holdings" count={equities.length} />
                {portfolio.isLoading && <Skeleton rows={4} />}
                {!portfolio.isLoading && equities.length === 0 && (
                  <Empty>No equity positions.</Empty>
                )}
                {equities.map((p) => (
                  <PositionRow key={p.symbol} position={p} onClick={() => goToSymbol(p.symbol)} />
                ))}
              </section>

              {options.length > 0 && (
                <section>
                  <SectionHeader title="Options" count={options.length} />
                  {options.map((p) => (
                    <PositionRow
                      key={`${p.symbol}-${p.option?.expiration}`}
                      position={p}
                      label={p.option ? optionLabel(p.option) : p.symbol}
                      onClick={() => goToSymbol(p.option?.underlyingSymbol ?? p.symbol)}
                    />
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function AccountOverview({
  totalValue,
  dayChange,
  dayChangePercent,
  cash,
  buyingPower,
  loading,
}: {
  totalValue: number;
  dayChange: number;
  dayChangePercent: number;
  cash: number;
  buyingPower: number;
  loading: boolean;
}) {
  const up = dayChange >= 0;

  return (
    <section className="glass-bright rounded-xl p-6">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
            Portfolio value
          </p>
          <p className="mt-1.5 font-mono text-[34px] font-bold leading-none tracking-[-0.02em] text-text-primary tabular-nums">
            {loading ? '—' : money(totalValue)}
          </p>
          <p
            className={`mt-2 font-mono text-[13px] tabular-nums ${up ? 'text-emerald' : 'text-rose'}`}
          >
            {loading ? '' : `${up ? '▲' : '▼'} ${money(Math.abs(dayChange))} (${signed(dayChangePercent)}%)`}
            <span className="ml-2 text-text-tertiary">Today</span>
          </p>
        </div>

        <div className="flex gap-8">
          <Stat label="Cash" value={loading ? '—' : money(cash)} />
          <Stat label="Buying power" value={loading ? '—' : money(buyingPower)} />
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="whitespace-nowrap">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
        {label}
      </p>
      <p className="mt-1.5 font-mono text-[18px] text-text-primary tabular-nums">{value}</p>
    </div>
  );
}

/**
 * One watchlist, expanded on demand.
 *
 * Symbols and quotes are fetched per list, so opening every list at once would
 * cost a request per list plus a recurring quote poll for symbols nobody is
 * reading. Both queries are gated on `open`, which makes the cheap thing and
 * the obvious thing the same thing.
 */
function WatchlistSection({
  list,
  open,
  onToggle,
  onSymbolClick,
}: {
  list: BrokerWatchlist;
  open: boolean;
  onToggle: () => void;
  onSymbolClick: (symbol: string) => void;
}) {
  const detail = useBrokerWatchlist(open ? list.id : null);
  const symbols = detail.data?.symbols ?? [];
  const quotes = useBrokerQuotes(open ? symbols : []);

  const bySymbol = useMemo(() => {
    const map = new Map<string, Quote>();
    for (const q of quotes.data?.quotes ?? []) map.set(q.symbol, q);
    return map;
  }, [quotes.data]);

  return (
    <div className="border-t border-border-subtle">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-1 py-3 text-left hover:bg-surface/40 transition-colors"
      >
        <span className="flex min-w-0 items-center gap-2">
          {list.emoji && <span className="text-[14px]">{list.emoji}</span>}
          <span className="truncate text-[14px] font-semibold text-text-primary">{list.name}</span>
        </span>
        <span className="flex items-center gap-3">
          <span className="font-mono text-[12px] text-text-tertiary tabular-nums">
            {list.symbolCount}
          </span>
          <span className="w-3 text-center text-[11px] text-text-muted">{open ? '▾' : '▸'}</span>
        </span>
      </button>

      {open && detail.isLoading && <Skeleton rows={3} />}

      {open && !detail.isLoading && symbols.length === 0 && (
        // The brokerage's count includes crypto, futures and indexes we filter
        // out, so "12 items" can legitimately resolve to no equities. Saying so
        // beats an empty list that looks broken.
        <Empty>Nothing here that quotes as an equity.</Empty>
      )}

      {open &&
        symbols.map((symbol) => {
          const quote = bySymbol.get(symbol);
          return (
            <button
              key={symbol}
              onClick={() => onSymbolClick(symbol)}
              className="flex w-full items-center justify-between border-t border-border-subtle/60 px-3 py-2.5 text-left hover:bg-surface/40 transition-colors"
            >
              <span className="font-mono text-[13px] font-semibold text-text-primary">{symbol}</span>
              {quote ? (
                <span className="flex items-center gap-4 font-mono text-[13px] tabular-nums">
                  <span className="text-text-secondary">{money(quote.price)}</span>
                  <span
                    className={`w-16 text-right ${quote.changePercent >= 0 ? 'text-emerald' : 'text-rose'}`}
                  >
                    {signed(quote.changePercent)}%
                  </span>
                </span>
              ) : (
                <span className="font-mono text-[13px] text-text-muted">···</span>
              )}
            </button>
          );
        })}
    </div>
  );
}

function PositionRow({
  position,
  label,
  onClick,
}: {
  position: Position;
  label?: string;
  onClick: () => void;
}) {
  const isOption = position.assetType === 'OPTION';
  const detail = isOption
    ? `${position.quantity > 0 ? '+' : ''}${position.quantity} contracts · avg ${money(position.averagePrice)}`
    : `${position.quantity} shares · avg ${money(position.averagePrice)}`;

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between border-t border-border-subtle px-1 py-3 text-left hover:bg-surface/40 transition-colors"
    >
      <span className="min-w-0">
        <span className="block truncate font-mono text-[13px] font-semibold text-text-primary">
          {label ?? position.symbol}
        </span>
        <span className="block truncate text-[11px] text-text-tertiary">{detail}</span>
      </span>
      <span className="flex items-center gap-4 whitespace-nowrap font-mono text-[13px] tabular-nums">
        <span className="text-text-secondary">{money(position.marketValue)}</span>
        <span
          className={`w-16 text-right ${position.dayChangePercent >= 0 ? 'text-emerald' : 'text-rose'}`}
        >
          {signed(position.dayChangePercent)}%
        </span>
      </span>
    </button>
  );
}

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="mb-1 flex items-baseline justify-between">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
        {title}
      </h2>
      {count !== undefined && (
        <span className="font-mono text-[11px] text-text-muted tabular-nums">{count}</span>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-1 py-3 text-[12px] text-text-muted">{children}</p>;
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-px" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="border-t border-border-subtle py-3">
          <div className="h-3 w-24 animate-pulse rounded bg-surface" />
        </div>
      ))}
    </div>
  );
}

function NotLinked() {
  return (
    <section className="glass-bright rounded-xl p-8 text-center">
      <h2 className="text-[16px] font-semibold text-text-primary">No brokerage linked</h2>
      <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-text-tertiary">
        Connect Robinhood to see your accounts, watchlists and positions here.
      </p>
      <a
        href="/settings"
        className="mt-5 inline-block rounded-lg border border-accent/30 bg-accent/15 px-4 py-2.5 text-[13px] font-semibold text-accent-bright transition-colors hover:bg-accent/25"
      >
        Go to Settings
      </a>
    </section>
  );
}

function money(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}
