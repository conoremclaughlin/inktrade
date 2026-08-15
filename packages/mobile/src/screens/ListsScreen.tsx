import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BrokerWatchlist, EarningsDate, Quote } from '@inktrade/client';
import type { RootStackParamList } from '../navigation';
import {
  useBrokerWatchlist,
  useBrokerWatchlists,
  useWatchlistQuotes,
} from '../hooks/useBrokerWatchlists';
import { API_BASE_URL, API_URL_HINT } from '../lib/api';
import { PositionRow } from '../components/PositionRow';
import { OversoldScan } from '../components/OversoldScan';
import { EarningsBadge } from '../components/EarningsBadge';
import { useEarnings } from '../hooks/useEarnings';
import { colors, fonts, radii, spacing } from '../ui/theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * The brokerage's watchlists.
 *
 * One list is open at a time. That is not a space-saving choice — symbols and
 * quotes are fetched per list, so opening everything at once would cost a
 * request per list plus a recurring quote poll for symbols nobody is reading.
 * An accordion makes the cheap thing and the obvious thing the same thing.
 */
export function ListsScreen() {
  const navigation = useNavigation<Nav>();
  const { data, isLoading, isFetching, refetch, error } = useBrokerWatchlists();
  const [openId, setOpenId] = useState<string | null>(null);

  const lists = useMemo(
    // Empty lists last: they can't be read, so they shouldn't be in the way.
    () => [...(data?.watchlists ?? [])].sort((a, b) => b.symbolCount - a.symbolCount),
    [data],
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.accent} />
      }
    >
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>Couldn&apos;t reach the API at {API_BASE_URL}</Text>
          {API_URL_HINT && <Text style={styles.errorHint}>{API_URL_HINT}</Text>}
        </View>
      )}

      {!error && lists.length === 0 && (
        <Text style={styles.empty}>
          No watchlists yet. Link a brokerage in Settings on the web app.
        </Text>
      )}

      {/*
        The one unconditional door to the LETF screen.

        It's otherwise reached from a leveraged ticker's Stock screen, which
        means it doesn't exist at all for anyone who neither holds nor watches
        one — and those are exactly the people still deciding whether to buy.
        The screen carries its own symbol input, so a single entry is enough.
      */}
      <Pressable
        onPress={() => navigation.navigate('Letf', {})}
        style={({ pressed }) => [styles.tool, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
      >
        <View style={styles.toolCopy}>
          <Text style={styles.toolTitle}>Leveraged ETF analysis</Text>
          <Text style={styles.toolSub}>
            What a 3× fund actually returned, and what the daily reset cost
          </Text>
        </View>
        <Text style={styles.toolChevron}>›</Text>
      </Pressable>

      {lists.map((list) => (
        <ListSection
          key={list.id}
          list={list}
          open={openId === list.id}
          onToggle={() => setOpenId(openId === list.id ? null : list.id)}
          onSymbolPress={(symbol) => navigation.navigate('Stock', { symbol })}
        />
      ))}
    </ScrollView>
  );
}

function ListSection({
  list,
  open,
  onToggle,
  onSymbolPress,
}: {
  list: BrokerWatchlist;
  open: boolean;
  onToggle: () => void;
  onSymbolPress: (symbol: string) => void;
}) {
  // Both queries are gated on `open`, so a closed list costs nothing.
  const detail = useBrokerWatchlist(open ? list.id : null);
  const symbols = detail.data?.symbols ?? [];
  const quotes = useWatchlistQuotes(open ? symbols : []);

  const bySymbol = useMemo(() => {
    const map = new Map<string, Quote>();
    for (const q of quotes.data?.quotes ?? []) map.set(q.symbol, q);
    return map;
  }, [quotes.data]);

  // Also gated on `open`, for the same reason as the quotes above.
  const earnings = useEarnings(open ? symbols : []);
  const earningsBySymbol = useMemo(() => {
    const map = new Map<string, EarningsDate>();
    for (const e of earnings.data?.earnings ?? []) map.set(e.symbol, e);
    return map;
  }, [earnings.data]);

  return (
    <View>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.sectionHeader, pressed && styles.pressed]}
      >
        <View style={styles.headerLeft}>
          {list.emoji ? <Text style={styles.emoji}>{list.emoji}</Text> : null}
          <Text style={styles.sectionTitle} numberOfLines={1}>
            {list.name}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.count}>{list.symbolCount}</Text>
          <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
        </View>
      </Pressable>

      {open && detail.isLoading && (
        <View style={styles.inlineLoading}>
          <ActivityIndicator color={colors.accent} size="small" />
        </View>
      )}

      {/*
        Scanning belongs on the open list: that's the set of symbols in front
        of you, and it's the only place the question "which of these is
        oversold" has an obvious subject.
      */}
      {open && symbols.length > 0 && <OversoldScan symbols={symbols} />}

      {open && !detail.isLoading && symbols.length === 0 && (
        // The brokerage's count includes crypto, futures and indexes we filter
        // out, so "12 items" can legitimately resolve to no equities. Saying so
        // beats an empty list that looks broken.
        <Text style={styles.empty}>Nothing here that quotes as an equity.</Text>
      )}

      {open &&
        symbols.map((symbol) => {
          const quote = bySymbol.get(symbol);
          return (
            <PositionRow
              key={symbol}
              symbol={symbol}
              badge={
                <EarningsBadge
                  earnings={earningsBySymbol.get(symbol)}
                  asOf={earnings.data?.asOf ?? ''}
                />
              }
              value={quote?.price ?? 0}
              changePercent={quote?.changePercent ?? 0}
              pending={!quote}
              onPress={() => onSymbolPress(symbol)}
            />
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.void },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  content: { paddingBottom: spacing.xxl },
  pressed: { backgroundColor: colors.surface },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  emoji: { fontSize: 14 },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  count: { color: colors.textTertiary, fontFamily: fonts.mono, fontSize: 12 },
  chevron: { color: colors.textMuted, fontSize: 12, width: 12, textAlign: 'center' },

  inlineLoading: { paddingVertical: spacing.md },
  empty: {
    color: colors.textMuted,
    fontSize: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },

  errorBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.rose,
    backgroundColor: 'rgba(244,63,94,0.08)',
    gap: 4,
  },
  errorText: { color: colors.rose, fontSize: 12, fontWeight: '600' },
  errorHint: { color: colors.textTertiary, fontSize: 11, lineHeight: 15 },

  tool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderDefault,
  },
  toolCopy: { flex: 1, gap: 2 },
  toolTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  toolSub: { color: colors.textTertiary, fontSize: 11, lineHeight: 15 },
  toolChevron: { color: colors.textTertiary, fontSize: 20 },
});
