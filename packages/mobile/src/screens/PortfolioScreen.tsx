import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import {
  PORTFOLIO_PERIODS,
  allPositions,
  brokerIdOf,
  optionLabel,
  type PortfolioPeriod,
  type PortfolioPoint,
} from '@inktrade/client';
import type { RootStackParamList } from '../navigation';
import { usePortfolio, usePortfolioHistory } from '../hooks/usePortfolio';
import { PortfolioChart } from '../components/PortfolioChart';
import { PositionRow } from '../components/PositionRow';
import { AssignmentBanner } from '../components/AssignmentBanner';
import { API_BASE_URL } from '../lib/api';
import { changeColor, colors, fonts, formatPercent, formatPrice, radii, spacing } from '../ui/theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function PortfolioScreen() {
  const navigation = useNavigation<Nav>();
  const [period, setPeriod] = useState<PortfolioPeriod>('1D');
  const [scrubbed, setScrubbed] = useState<PortfolioPoint | null>(null);

  const portfolio = usePortfolio();
  const history = usePortfolioHistory(period);

  const points = history.data?.points ?? [];

  // While scrubbing, the header reports the touched point and its change from
  // the start of the window. Released, it reports today.
  const header = useMemo(() => {
    if (scrubbed && points.length > 0) {
      const base = points[0].value;
      const delta = scrubbed.value - base;
      return {
        value: scrubbed.value,
        delta,
        deltaPercent: base > 0 ? (delta / base) * 100 : 0,
        caption: formatStamp(scrubbed.t, period),
      };
    }
    return {
      value: portfolio.summary?.totalValue ?? 0,
      delta: portfolio.summary?.dayChange ?? 0,
      deltaPercent: portfolio.summary?.dayChangePercent ?? 0,
      caption: 'Today',
    };
  }, [scrubbed, points, portfolio.summary, period]);

  const positions = portfolio.summary ? allPositions(portfolio.summary) : [];
  const equities = positions.filter((p) => p.assetType !== 'OPTION');
  const options = positions.filter((p) => p.assetType === 'OPTION');
  const cash = portfolio.summary?.accounts.reduce((s, a) => s + a.balances.cashBalance, 0) ?? 0;

  const onRefresh = useCallback(() => {
    portfolio.refetch();
    history.refetch();
  }, [portfolio, history]);

  if (portfolio.isLoading) {
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
        <RefreshControl
          refreshing={portfolio.isFetching && !portfolio.isLoading}
          onRefresh={onRefresh}
          tintColor={colors.accent}
        />
      }
      // The chart claims horizontal drags; without this the ScrollView steals
      // them and scrubbing never starts.
      scrollEnabled={scrubbed === null}
    >
      <View style={styles.headerBlock}>
        <Text style={styles.headerLabel}>Portfolio value</Text>
        <Text style={styles.total}>${formatPrice(header.value)}</Text>
        <Text style={[styles.delta, { color: changeColor(header.deltaPercent) }]}>
          {header.delta >= 0 ? '▲' : '▼'} ${formatPrice(Math.abs(header.delta))}
          {'  '}({formatPercent(header.deltaPercent)})
          <Text style={styles.deltaCaption}>{'   '}{header.caption}</Text>
        </Text>
      </View>

      <PortfolioChart points={points} onScrub={setScrubbed} height={170} placeholder />

      <View style={styles.periods}>
        {PORTFOLIO_PERIODS.map((p) => {
          const on = p === period;
          return (
            <Pressable
              key={p}
              onPress={() => setPeriod(p)}
              style={({ pressed }) => [styles.period, on && styles.periodOn, pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.periodText, on && styles.periodTextOn]}>{p}</Text>
            </Pressable>
          );
        })}
      </View>

      {history.data?.approximate && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            History before daily snapshots began is reconstructed, and option positions can&apos;t be
            priced retroactively — treat this range as approximate.
          </Text>
        </View>
      )}

      {/*
        The curve and the holdings now come from different places: positions are
        live, but no brokerage returns portfolio value history, so the chart is
        still sample data. Saying "sample data" over the whole screen would be
        wrong, and saying nothing would be worse.
      */}
      <View style={[styles.banner, styles.bannerMock]}>
        <Text style={[styles.bannerText, styles.bannerMockText]}>
          Holdings are live. The value curve is sample data — no brokerage reports
          portfolio history, so a real one needs our own daily snapshots.
        </Text>
      </View>

      {portfolio.error && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Couldn&apos;t reach the API at {API_BASE_URL}. Link a brokerage in Settings on the
            web app, and check the dev server is running.
          </Text>
        </View>
      )}

      {/*
        Above the holdings, not buried among them: this is the only thing on
        the screen with a same-day deadline.
      */}
      <AssignmentBanner positions={positions} broker={brokerIdOf(portfolio.provider)} />

      <Section title="Holdings" count={equities.length} />
      {equities.map((p) => (
        <PositionRow
          key={p.symbol}
          symbol={p.symbol}
          detail={`${p.quantity} shares · avg $${formatPrice(p.averagePrice)}`}
          value={p.marketValue}
          changePercent={p.dayChangePercent}
          currency
          onPress={() => navigation.navigate('Stock', { symbol: p.symbol })}
        />
      ))}

      {options.length > 0 && <Section title="Options" count={options.length} />}
      {options.map((p) => (
        <PositionRow
          key={p.symbol + p.option!.expiration}
          symbol={p.option ? optionLabel(p.option) : p.symbol}
          detail={`${p.quantity > 0 ? '+' : ''}${p.quantity} contracts · avg $${formatPrice(p.averagePrice)}`}
          value={p.marketValue}
          changePercent={p.dayChangePercent}
          currency
          onPress={() =>
            navigation.navigate('Stock', { symbol: p.option?.underlyingSymbol ?? p.symbol })
          }
        />
      ))}

      <Section title="Cash" />
      <View style={styles.cashRow}>
        <Text style={styles.cashLabel}>Available</Text>
        <Text style={styles.cashValue}>${formatPrice(cash)}</Text>
      </View>
    </ScrollView>
  );
}

function Section({ title, count }: { title: string; count?: number }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {count !== undefined && <Text style={styles.sectionCount}>{count}</Text>}
    </View>
  );
}

/** Scrub captions read as a time within a day, and a date beyond one. */
function formatStamp(iso: string, period: PortfolioPeriod): string {
  const d = new Date(iso);
  if (period === '1D') {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.void },
  content: { paddingBottom: spacing.xxl },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.void },

  headerBlock: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
  headerLabel: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  total: {
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.8,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  delta: { fontFamily: fonts.mono, fontSize: 13, marginTop: 3, fontVariant: ['tabular-nums'] },
  deltaCaption: { color: colors.textTertiary },

  periods: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  period: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: radii.sm },
  periodOn: { backgroundColor: 'rgba(59,130,246,0.16)' },
  periodText: { color: colors.textTertiary, fontFamily: fonts.mono, fontSize: 12 },
  periodTextOn: { color: colors.accentBright, fontWeight: '700' },

  banner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.deep,
  },
  bannerText: { color: colors.textTertiary, fontSize: 11, lineHeight: 16 },
  bannerMock: { borderColor: 'rgba(245,158,11,0.35)', backgroundColor: 'rgba(245,158,11,0.07)' },
  bannerMockText: { color: colors.amber },

  section: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xs,
  },
  sectionTitle: {
    color: colors.textTertiary,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  sectionCount: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 10 },

  cashRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  cashLabel: { color: colors.textSecondary, fontSize: 13 },
  cashValue: {
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
});
