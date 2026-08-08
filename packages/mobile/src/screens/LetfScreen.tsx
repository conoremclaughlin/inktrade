import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  describeLetf,
  letfHistoryQuery,
  letfHoldingsQuery,
  letfProfileQuery,
  realizedLeverage,
  LETF_PERIODS,
  type LetfPeriod,
} from '@inktrade/client';
import { lookupLetf } from '@inktrade/engine/letf';
import type { RootStackParamList } from '../navigation';
import { api } from '../lib/api';
import { LetfDivergenceChart, type DivergenceScrub } from '../components/LetfDivergenceChart';
import { DecaySimulator } from '../components/DecaySimulator';
import { RedDayTable } from '../components/RedDayTable';
import { LetfHoldings } from '../components/LetfHoldings';
import {
  changeColor,
  colors,
  fonts,
  formatCompact,
  formatPercent,
  formatPrice,
  radii,
  spacing,
} from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Letf'>;

const QUICK_PICKS = ['TQQQ', 'SOXL', 'UPRO', 'TNA', 'TECL', 'FAS', 'SQQQ', 'SPXU'];

export function LetfScreen({ route }: Props) {
  const [symbol, setSymbol] = useState((route.params?.symbol ?? 'TQQQ').toUpperCase());
  const [draft, setDraft] = useState(symbol);
  const [period, setPeriod] = useState<LetfPeriod>('1y');
  const [scrub, setScrub] = useState<DivergenceScrub | null>(null);

  useEffect(() => {
    const next = route.params?.symbol?.toUpperCase();
    if (next && next !== symbol) {
      setSymbol(next);
      setDraft(next);
    }
    // Route params are the only trigger; symbol is set alongside them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.symbol]);

  const profile = useQuery(letfProfileQuery(api, symbol));
  const history = useQuery(letfHistoryQuery(api, symbol, period));
  const holdings = useQuery(letfHoldingsQuery(api, symbol));

  /*
   * Leverage from the registry, not from the API.
   *
   * The registry is bundled and synchronous, so the decay and red-day panels
   * can model the right multiple on the very first frame. Waiting for the
   * profile would render both against a default 3x and then silently redraw —
   * for a 2x fund that means showing the wrong risk first.
   */
  const registry = useMemo(() => lookupLetf(symbol), [symbol]);
  const leverageFactor = registry?.leverageFactor ?? profile.data?.registry.leverageFactor ?? 3;

  const realized = history.data ? realizedLeverage(history.data) : null;

  const commitSymbol = () => {
    const next = draft.trim().toUpperCase();
    if (!next || next === symbol) return;
    setSymbol(next);
    setScrub(null);
  };

  const notLeveraged = !registry && profile.isError;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerRow}>
        <TextInput
          value={draft}
          onChangeText={(t) => setDraft(t.toUpperCase())}
          onSubmitEditing={commitSymbol}
          onBlur={commitSymbol}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="search"
          placeholder="TQQQ"
          placeholderTextColor={colors.textMuted}
          style={styles.symbolInput}
          accessibilityLabel="Leveraged ETF symbol"
        />
        {profile.data && (
          <View style={styles.quote}>
            <Text style={styles.quotePrice}>${formatPrice(profile.data.price)}</Text>
            <Text style={[styles.quoteChange, { color: changeColor(profile.data.changePercent) }]}>
              {formatPercent(profile.data.changePercent)}
            </Text>
          </View>
        )}
      </View>

      {registry && (
        <Text style={styles.subtitle}>
          {describeLetf(registry)} · {registry.issuer}
          {profile.data?.expenseRatio != null &&
            ` · ${(profile.data.expenseRatio * 100).toFixed(2)}% fee`}
          {profile.data?.totalAssets != null &&
            ` · ${formatCompact(profile.data.totalAssets)} AUM`}
        </Text>
      )}

      {notLeveraged && (
        <View style={styles.errorBlock}>
          <Text style={styles.error}>
            {symbol} isn&apos;t a leveraged ETF we cover. This screen models the
            daily-reset drag that only these funds carry.
          </Text>
        </View>
      )}

      <View style={styles.picks}>
        {QUICK_PICKS.map((t) => (
          <Pressable
            key={t}
            onPress={() => {
              setSymbol(t);
              setDraft(t);
              setScrub(null);
            }}
            style={[styles.pick, t === symbol && styles.pickActive]}
            accessibilityRole="button"
          >
            <Text style={[styles.pickText, t === symbol && styles.pickTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      {/*
        The headline, and the reason this screen exists.

        Everything below explains or stress-tests this one comparison: the
        multiple on the label against the multiple the fund delivered.
      */}
      {realized && history.data && (
        <View style={styles.headline}>
          <Text style={styles.headlineLabel}>
            {scrub ? `AS OF ${scrub.point.date}` : `REALIZED OVER ${period.toUpperCase()}`}
          </Text>

          {realized.degenerate ? (
            <Text style={styles.headlineDegenerate}>
              The index barely moved over this window, so there is no meaningful
              multiple to quote. Try a longer period.
            </Text>
          ) : (
            <View style={styles.headlineRow}>
              <Text style={styles.headlineValue}>
                {realized.realized!.toFixed(2)}×
              </Text>
              <Text style={styles.headlineStated}>
                sold as {Math.abs(realized.stated)}×
              </Text>
            </View>
          )}

          <View style={styles.compare}>
            <Compare
              label={history.data.symbol}
              value={scrub ? scrub.point.letfCumReturn : history.data.totalLetfReturn}
              tone={colors.accentBright}
            />
            <Compare
              label={history.data.underlying}
              value={scrub ? scrub.point.underlyingCumReturn : history.data.totalUnderlyingReturn}
              tone={colors.textSecondary}
            />
            <Compare
              label={`${Math.abs(leverageFactor)}× naive`}
              value={scrub ? scrub.point.naiveCumReturn : history.data.totalNaiveReturn}
              tone={colors.amber}
            />
          </View>

          <Text style={styles.divergence}>
            {(() => {
              const gap = scrub ? scrub.point.divergence : history.data.totalDivergence;
              if (realized.inverted) {
                return `${history.data.symbol} fell while ${history.data.underlying} rose — this fund did not track its index at all over this window.`;
              }
              return gap < 0
                ? `Daily reset cost ${Math.abs(gap).toFixed(1)} points against a naive ${Math.abs(leverageFactor)}× return.`
                : `Daily reset added ${gap.toFixed(1)} points over a naive ${Math.abs(leverageFactor)}× return — a trending window compounds in your favour.`;
            })()}
          </Text>

          <Text style={styles.drawdown}>
            Worst drawdown over the window: −{history.data.maxDrawdownPct.toFixed(1)}%
          </Text>
        </View>
      )}

      <View style={styles.periods}>
        {LETF_PERIODS.map((p) => (
          <Pressable
            key={p.value}
            onPress={() => {
              setPeriod(p.value);
              setScrub(null);
            }}
            style={[styles.period, p.value === period && styles.periodActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: p.value === period }}
          >
            <Text style={[styles.periodText, p.value === period && styles.periodTextActive]}>
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {history.isLoading && !history.data && (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      )}

      {history.isError && (
        <Text style={styles.error}>
          Couldn&apos;t load history: {(history.error as Error).message}
        </Text>
      )}

      {history.data && history.data.points.length > 1 && (
        <Section title="Fund vs promise">
          <LetfDivergenceChart
            points={history.data.points}
            leverageFactor={leverageFactor}
            onScrub={setScrub}
          />
        </Section>
      )}

      <Section title="Volatility decay">
        <DecaySimulator leverageFactor={leverageFactor} />
      </Section>

      <Section title="Consecutive red days">
        <RedDayTable leverageFactor={leverageFactor} />
      </Section>

      {holdings.data && (
        <Section title={`Inside ${registry?.underlyingTicker ?? 'the index'}`}>
          <LetfHoldings data={holdings.data} />
        </Section>
      )}
    </ScrollView>
  );
}

function Compare({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <View style={styles.compareStat}>
      <Text style={styles.compareLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.compareValue, { color: tone }]}>
        {value >= 0 ? '+' : ''}
        {value.toFixed(1)}%
      </Text>
    </View>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.void },
  content: { paddingVertical: spacing.md, paddingBottom: spacing.xxl },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  symbolInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderDefault,
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  quote: { alignItems: 'flex-end' },
  quotePrice: { color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 18, fontWeight: '700' },
  quoteChange: { fontFamily: fonts.mono, fontSize: 12 },
  subtitle: {
    color: colors.textTertiary,
    fontSize: 11,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },

  picks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  pick: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  pickActive: { borderColor: colors.accent, backgroundColor: 'rgba(59,130,246,0.15)' },
  pickText: { color: colors.textSecondary, fontFamily: fonts.mono, fontSize: 11 },
  pickTextActive: { color: colors.accentBright },

  headline: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderDefault,
    gap: spacing.sm,
  },
  headlineLabel: {
    color: colors.textTertiary,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1,
  },
  headlineRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  headlineValue: {
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: 32,
    fontWeight: '700',
  },
  headlineStated: { color: colors.textTertiary, fontFamily: fonts.mono, fontSize: 13 },
  headlineDegenerate: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },

  compare: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    paddingTop: spacing.sm,
  },
  compareStat: { flex: 1 },
  compareLabel: { color: colors.textTertiary, fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.6 },
  compareValue: { fontFamily: fonts.mono, fontSize: 14, fontWeight: '600', marginTop: 2 },

  divergence: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  drawdown: { color: colors.textTertiary, fontFamily: fonts.mono, fontSize: 11 },

  periods: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  period: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  periodActive: { borderColor: colors.accent, backgroundColor: 'rgba(59,130,246,0.15)' },
  periodText: { color: colors.textSecondary, fontFamily: fonts.mono, fontSize: 11 },
  periodTextActive: { color: colors.accentBright },

  section: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.md,
  },

  loading: { paddingVertical: spacing.xl, alignItems: 'center' },
  errorBlock: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  error: {
    color: colors.rose,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
});
