import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  HISTORY_PERIODS,
  INDICATOR_LABELS,
  oiDistributionQuery,
  tickerHistoryQuery,
  type HistoryPeriod,
  OSCILLATOR_LABELS,
  type IndicatorId,
  type OscillatorId,
} from '@inktrade/client';
import type { RootStackParamList } from '../navigation';
import { api } from '../lib/api';
import { CandlestickChart, type ChartMode } from '../components/CandlestickChart';
import { OIChart } from '../components/OIChart';
import { OscillatorPane } from '../components/OscillatorPane';
import { VolumePane } from '../components/VolumePane';
import { PeriodLevels } from '../components/PeriodLevels';
import { SwingLevels } from '../components/SwingLevels';
import { OrderActivityList } from '../components/OrderActivityList';
import { useOrderActivity } from '../hooks/useTrading';
import { changeColor, colors, fonts, formatPercent, formatPrice, radii, spacing } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Stock'>;

const INDICATORS: IndicatorId[] = [
  'sma20',
  'sma50',
  'sma200',
  'ema12',
  'ema26',
  // The 50 EMA the WSB traders kept naming.
  'ema50',
  'bollinger',
];

/*
 * VWAP is deliberately absent.
 *
 * It is session-anchored by definition, and these are DAILY bars — so every
 * bar is its own session and the reset makes it degenerate. Measured on 254
 * bars of AAPL, the result equals (high + low + close) / 3 to within 6e-14:
 * not VWAP at all, just smoothed price wearing its name.
 *
 * A trader reading "VWAP" expects the volume-weighted average of the session
 * and will size a trade against it. Drawing typical price under that label is
 * worse than offering nothing. It comes back when intraday bars do.
 */

/** Oscillators are exclusive — two stacked panes leave no room for price. */
const OSCILLATORS: OscillatorId[] = ['rsi', 'macd'];

export function StockScreen({ route, navigation }: Props) {
  const { symbol } = route.params;
  const { width } = useWindowDimensions();

  const [period, setPeriod] = useState<HistoryPeriod>('1y');
  const [mode, setMode] = useState<ChartMode>('candlestick');
  const [active, setActive] = useState<IndicatorId[]>(['sma20', 'sma50']);
  const [oscillator, setOscillator] = useState<OscillatorId | null>('rsi');

  const history = useQuery(tickerHistoryQuery(api, symbol, period));
  const activity = useOrderActivity(symbol, 25);
  const oi = useQuery(oiDistributionQuery(api, symbol));

  const points = history.data?.points ?? [];
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const changePct = last && prev ? ((last.close - prev.close) / prev.close) * 100 : 0;

  const toggleIndicator = (id: IndicatorId) =>
    setActive((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.symbol}>{symbol}</Text>
        {last && (
          <View style={styles.priceBlock}>
            <Text style={styles.price}>${formatPrice(last.close)}</Text>
            <Text style={[styles.change, { color: changeColor(changePct) }]}>
              {formatPercent(changePct)}
            </Text>
          </View>
        )}
      </View>

      {/*
        A ticker screen with no way to act on the ticker is a dead end — you
        arrive from a watchlist, read the chart, and have to navigate back out
        and re-type the symbol to do anything about it.
      */}
      <View style={styles.actions}>
        <Pressable
          onPress={() => navigation.navigate('Tabs', { screen: 'Chain', params: { symbol } })}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={styles.actionText}>Option chain</Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate('Tabs', { screen: 'Trade', params: { symbol } })}
          style={({ pressed }) => [styles.action, styles.actionPrimary, pressed && styles.pressed]}
        >
          <Text style={[styles.actionText, styles.actionPrimaryText]}>Trade {symbol}</Text>
        </Pressable>
      </View>

      <Chips
        options={HISTORY_PERIODS.map((p) => ({ id: p.value, label: p.label }))}
        isActive={(id) => id === period}
        onPress={(id) => setPeriod(id as HistoryPeriod)}
      />

      <Chips
        options={[
          { id: 'candlestick', label: 'Candles' },
          { id: 'line', label: 'Line' },
        ]}
        isActive={(id) => id === mode}
        onPress={(id) => setMode(id as ChartMode)}
      />

      <Section title="Price">
        {history.isLoading ? (
          <Loading />
        ) : history.error ? (
          <ErrorNote message="Couldn't load price history" />
        ) : (
          <CandlestickChart points={points} mode={mode} indicators={active} height={300} />
        )}
      </Section>

      <Chips
        options={INDICATORS.map((id) => ({ id, label: INDICATOR_LABELS[id] }))}
        isActive={(id) => active.includes(id as IndicatorId)}
        onPress={(id) => toggleIndicator(id as IndicatorId)}
      />

      {/*
        Oscillators are their own pane and mutually exclusive: RSI runs 0-100
        and MACD swings around zero, so neither can share the price axis and
        two stacked panes would leave no room for price.
      */}
      <Chips
        options={OSCILLATORS.map((id) => ({ id, label: OSCILLATOR_LABELS[id] }))}
        isActive={(id) => id === oscillator}
        onPress={(id) => setOscillator(oscillator === id ? null : (id as OscillatorId))}
      />

      <VolumePane points={points} />

      {oscillator && points.length > 0 && (
        <OscillatorPane points={points} oscillator={oscillator} />
      )}

      {/*
        The levels a setup is described against — "near the monthly low", "3%
        off the 52-week high". Below the chart because they read as a summary
        of it, not as controls on it.
      */}
      <Section title="Levels">
        <PeriodLevels points={points} price={last?.close ?? null} />
      </Section>

      {/*
        Period levels are facts about the range; these are prices the market
        has actually reacted to. Different questions, so a separate section.
      */}
      <Section title="Support & resistance">
        <SwingLevels points={points} price={last?.close ?? null} />
      </Section>

      {history.data && (
        <View style={styles.statsRow}>
          <Stat label="Period return" value={formatPercent(history.data.totalReturn)} />
          <Stat label="Annualized" value={formatPercent(history.data.annualizedReturn)} />
          <Stat label="Max drawdown" value={formatPercent(history.data.maxDrawdownPct)} />
        </View>
      )}

      {/*
        Your own orders in this name, above the open-interest chart: what you
        did matters more than what the market did.
      */}
      <Section title="Your activity">
        <OrderActivityList
          orders={activity.data?.orders ?? []}
          loading={activity.isLoading}
          emptyLabel={`No orders in ${symbol}.`}
        />
      </Section>

      <Section title="Open interest by strike">
        {oi.isLoading ? (
          <Loading />
        ) : oi.error || !oi.data ? (
          <ErrorNote message="Couldn't load options data" />
        ) : (
          <>
            <View style={styles.oiMeta}>
              <Meta label="Max pain" value={`$${Math.round(oi.data.maxPainStrike)}`} />
              <Meta label="P/C ratio" value={oi.data.pcRatio.toFixed(2)} />
            </View>
            <OIChart
              strikes={oi.data.strikes}
              underlyingPrice={oi.data.underlyingPrice}
              maxPain={oi.data.maxPainStrike}
              width={width - spacing.lg * 2}
            />
          </>
        )}
      </Section>
    </ScrollView>
  );
}

function Chips({
  options,
  isActive,
  onPress,
}: {
  options: { id: string; label: string }[];
  isActive: (id: string) => boolean;
  onPress: (id: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
    >
      {options.map((o) => {
        const activeChip = isActive(o.id);
        return (
          <Pressable
            key={o.id}
            onPress={() => onPress(o.id)}
            style={({ pressed }) => [
              styles.chip,
              activeChip && styles.chipActive,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text style={[styles.chipText, activeChip && styles.chipTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <Text style={styles.metaText}>
      <Text style={styles.metaLabel}>{label}: </Text>
      {value}
    </Text>
  );
}

const Loading = () => (
  <View style={styles.loading}>
    <ActivityIndicator color={colors.accent} />
  </View>
);

const ErrorNote = ({ message }: { message: string }) => (
  <View style={styles.loading}>
    <Text style={styles.errorText}>{message}</Text>
  </View>
);

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  action: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  actionPrimary: { borderColor: colors.accent, backgroundColor: 'rgba(59,130,246,0.16)' },
  actionText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  actionPrimaryText: { color: colors.accentBright },
  pressed: { opacity: 0.7 },

  container: { flex: 1, backgroundColor: colors.void },
  content: { paddingBottom: spacing.xxl },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  symbol: { color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 22, fontWeight: '700' },
  priceBlock: { alignItems: 'flex-end' },
  price: { color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 18 },
  change: { fontFamily: fonts.mono, fontSize: 13 },

  chips: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  chipActive: { backgroundColor: 'rgba(59,130,246,0.15)', borderColor: colors.accent },
  chipText: { color: colors.textTertiary, fontSize: 11, fontFamily: fonts.mono },
  chipTextActive: { color: colors.accentBright, fontWeight: '600' },

  section: { marginTop: spacing.lg },
  sectionTitle: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },

  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  statLabel: { color: colors.textMuted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8 },
  statValue: { color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 14, marginTop: 2 },

  oiMeta: { flexDirection: 'row', gap: spacing.lg, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  metaText: { color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 11 },
  metaLabel: { color: colors.textMuted },

  loading: { height: 160, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: colors.rose, fontSize: 12 },
});
