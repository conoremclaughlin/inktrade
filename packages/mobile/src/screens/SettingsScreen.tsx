import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import {
  COST_BASIS_LABELS,
  COST_BASIS_STRATEGIES,
  canPlaceOrders,
  isModeUserControlled,
  type CostBasisStrategy,
} from '@inktrade/client';
import { usePortfolio } from '../hooks/usePortfolio';
import {
  useCostBasis,
  useSetCostBasis,
  useSetTradingMode,
  useTradingMode,
} from '../hooks/useTrading';
import { API_BASE_URL } from '../lib/api';
import { colors, fonts, radii, spacing } from '../ui/theme';

/**
 * Settings.
 *
 * Two of these change what happens to money rather than how it looks, so they
 * come first and say what they do in full. Both are enforced server-side — the
 * phone explains them, it does not decide them, and an app that only hid a
 * button would not be a kill switch.
 */
export function SettingsScreen() {
  const mode = useTradingMode();
  const setMode = useSetTradingMode();
  const basis = useCostBasis();
  const setBasis = useSetCostBasis();
  const portfolio = usePortfolio();

  const [showStrategies, setShowStrategies] = useState(false);

  const reviewOnly = mode.data ? !canPlaceOrders(mode.data) : false;
  const canToggle = mode.data ? isModeUserControlled(mode.data) : false;
  const basisLocked = basis.data?.source === 'env';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Section title="Trading" />

      <View style={styles.card}>
        {/*
          The whole row toggles, not just the switch. A bare Switch is 63x28pt
          — well under the 44pt minimum target — and on the one control that
          decides whether real orders can be sent, a near-miss that silently
          does nothing is the wrong failure. Tapping the switch still works;
          this widens the target to the row.
        */}
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Order placement"
          accessibilityState={{ checked: !reviewOnly, disabled: !canToggle }}
          disabled={!canToggle || setMode.isPending}
          onPress={() => setMode.mutate(reviewOnly ? 'ENABLED' : 'REVIEW_ONLY')}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Order placement</Text>
            <Text style={styles.rowDetail}>
              {reviewOnly
                ? 'Orders are priced and checked, never submitted.'
                : 'Orders you confirm are sent to the brokerage.'}
            </Text>
          </View>
          <Switch
            value={!reviewOnly}
            disabled={!canToggle || setMode.isPending}
            onValueChange={(on) => setMode.mutate(on ? 'ENABLED' : 'REVIEW_ONLY')}
            trackColor={{ false: colors.surface, true: 'rgba(16,185,129,0.5)' }}
            thumbColor={colors.textPrimary}
            // The row already announces itself; a nested control would make
            // VoiceOver read the same switch twice.
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </Pressable>

        {mode.data?.reason && (
          <Text style={[styles.note, !canToggle && styles.noteLocked]}>{mode.data.reason}</Text>
        )}

        {/*
          A failed toggle must say so. React Query reverts the switch to the
          server's value on error, so without this the control flips back on
          its own and the user is left believing they turned trading off when
          they didn't — the worst possible outcome for a kill switch.
        */}
        {setMode.isError && (
          <Text style={[styles.note, styles.noteError]}>
            Couldn&apos;t change this — order placement is unchanged. {errorText(setMode.error)}
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <Pressable
          onPress={() => !basisLocked && setShowStrategies(!showStrategies)}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Cost basis</Text>
            <Text style={styles.rowDetail}>
              Which lots a sell consumes when you haven&apos;t picked them by hand. Brokers
              default to FIFO, which closes your oldest — usually cheapest — shares and
              realizes the largest possible gain.
            </Text>
            <Text style={styles.rowValue}>
              {basis.data ? COST_BASIS_LABELS[basis.data.strategy] : '…'}
            </Text>
          </View>
          {!basisLocked && <Text style={styles.chevron}>{showStrategies ? '▾' : '▸'}</Text>}
        </Pressable>

        {showStrategies &&
          COST_BASIS_STRATEGIES.map((strategy) => {
            const on = basis.data?.strategy === strategy;
            return (
              <Pressable
                key={strategy}
                disabled={setBasis.isPending}
                onPress={() => {
                  setBasis.mutate(strategy as CostBasisStrategy);
                  setShowStrategies(false);
                }}
                style={({ pressed }) => [
                  styles.option,
                  on && styles.optionOn,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.optionText, on && styles.optionTextOn]}>
                  {COST_BASIS_LABELS[strategy]}
                </Text>
                {strategy === 'FIFO' && <Text style={styles.brokerDefault}>broker default</Text>}
              </Pressable>
            );
          })}

        {setBasis.isError && (
          <Text style={[styles.note, styles.noteError]}>
            Couldn&apos;t change this — sells still use{' '}
            {basis.data ? COST_BASIS_LABELS[basis.data.strategy] : 'the current strategy'}.{' '}
            {errorText(setBasis.error)}
          </Text>
        )}

        {basisLocked && (
          <Text style={[styles.note, styles.noteLocked]}>
            Set by INKTRADE_COST_BASIS for this deployment, so it can&apos;t be changed here.
          </Text>
        )}

        <Text style={styles.footnote}>
          Applies to ordinary sells. Exercise and assignment can&apos;t carry a lot selection at
          all — Inktrade warns you before those instead.
        </Text>
      </View>

      <Section title="Connection" />

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Brokerage</Text>
            <Text style={styles.rowDetail}>
              {portfolio.provider
                ? `Linked to ${portfolio.provider}${portfolio.isMock ? ' (sample data)' : ''}`
                : 'Not linked. Connect a brokerage in Settings on the web app.'}
            </Text>
          </View>
        </View>
        <Text style={styles.footnote}>API {API_BASE_URL}</Text>
      </View>
    </ScrollView>
  );
}

/** A message worth showing. Never the raw object, never an empty string. */
function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : '';
  return message || 'Try again in a moment.';
}

function Section({ title }: { title: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.void },
  content: { paddingBottom: spacing.xxl },
  pressed: { opacity: 0.7 },

  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.xs },
  sectionTitle: {
    color: colors.textTertiary,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },

  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.deep,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  rowDetail: { color: colors.textTertiary, fontSize: 12, lineHeight: 17 },
  rowValue: { color: colors.accentBright, fontSize: 13, fontWeight: '600', marginTop: 4 },
  chevron: { color: colors.textMuted, fontSize: 12 },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  optionOn: { backgroundColor: 'rgba(59,130,246,0.12)' },
  optionText: { color: colors.textSecondary, fontSize: 13 },
  optionTextOn: { color: colors.accentBright, fontWeight: '700' },
  brokerDefault: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 0.8,
  },

  note: {
    color: colors.textTertiary,
    fontSize: 12,
    lineHeight: 17,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
  },
  noteLocked: {
    color: colors.amber,
    borderColor: 'rgba(245,158,11,0.3)',
    backgroundColor: 'rgba(245,158,11,0.08)',
  },
  noteError: {
    color: colors.rose,
    borderColor: 'rgba(244,63,94,0.35)',
    backgroundColor: 'rgba(244,63,94,0.08)',
  },
  footnote: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
});
