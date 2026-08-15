'use client';

import { Navbar } from '@/components/navbar';
import { WatchlistTable } from '@/components/watchlist/watchlist-table';
import { OversoldScan } from '@/components/watchlist/oversold-scan';
import { useWatchlistSymbols } from '@/lib/hooks';

export default function WatchlistPage() {
  const { symbols } = useWatchlistSymbols();

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      <main className="mx-auto max-w-7xl px-6 pt-24 pb-16">
        <div className="mb-6">
          <h1 className="text-[22px] font-bold text-text-primary tracking-[-0.02em]">
            Watchlist
          </h1>
          <p className="text-[13px] text-text-tertiary mt-1">
            Track your positions and market movers
          </p>
        </div>
        <OversoldScan symbols={symbols} />
        <WatchlistTable />
      </main>
    </div>
  );
}
