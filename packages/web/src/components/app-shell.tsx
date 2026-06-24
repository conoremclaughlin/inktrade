'use client';

import { type ReactNode } from 'react';
import { Navbar } from '@/components/navbar';
import { WatchlistPanel } from '@/components/watchlist/watchlist-panel';

interface AppShellProps {
  children: ReactNode;
  activeSymbol?: string;
  onSymbolClick?: (symbol: string) => void;
  showWatchlist?: boolean;
}

export function AppShell({
  children,
  activeSymbol,
  onSymbolClick,
  showWatchlist = true,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-void flex flex-col">
      <Navbar />
      <div className="flex flex-1 pt-16">
        <main className="flex-1 min-w-0 overflow-x-hidden">
          {children}
        </main>
        {showWatchlist && onSymbolClick && (
          <WatchlistPanel
            activeSymbol={activeSymbol}
            onSymbolClick={onSymbolClick}
          />
        )}
      </div>
    </div>
  );
}
