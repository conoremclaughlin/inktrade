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
import {
  atmIndex,
  chainGridQuery,
  contractsForExpiry,
  defaultTarget,
  expiryKey,
  quotesQuery,
  type WireOptionContract,
} from '@inktrade/client';
import type { OptionType } from '@inktrade/engine/math';
import { api } from '../lib/api';
import { ContractDetail } from '../components/ContractDetail';
import { scoreLadder, StrikeLadder } from '../components/StrikeLadder';
import { changeColor, colors, fonts, formatPercent, formatPrice, radii, spacing } from '../ui/theme';

/**
 * How many expirations to pull in one window.
 *
 * Each one is a separate upstream chain request, and a cold wide underlying
 * already measures 80s at six. A phone shows one expiration at a time, so
 * four buys enough to page through without paying for columns nobody looks at.
 */
const EXPIRATION_WINDOW = 4;

/**
 * The options calculator.
 *
 * Web lays strikes down and expirations across in one heatmap; a phone can't
 * carry both axes legibly, so the expiration becomes a selector and the grid
 * becomes a ladder. Same maths underneath — the leverage and probability
 * functions live in @inktrade/engine and the band boundaries with them, so a
 * strike that reads "high leverage" here reads the same on the desktop.
 */
export function CalculatorScreen() {
  const [symbol, setSymbol] = useState('MU');
  const [draft, setDraft] = useState('MU');
  const [optionType, setOptionType] = useState<OptionType>('call');
  const [expOffset, setExpOffset] = useState(0);
  const [expiry, setExpiry] = useState<string | null>(null);
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [targetDraft, setTargetDraft] = useState('');

  const quote = useQuery(quotesQuery(api, [symbol]));
  const grid = useQuery(
    chainGridQuery(api, symbol, { type: optionType, offset: expOffset, limit: EXPIRATION_WINDOW }),
  );

  const spot = grid.data?.underlyingPrice ?? quote.data?.quotes[0]?.price ?? null;

  const contracts = useMemo(
    () => (optionType === 'call' ? grid.data?.calls : grid.data?.puts) ?? [],
    [grid.data, optionType],
  );

  const expirations = useMemo(
    () => grid.data?.expirations.map(expiryKey) ?? [],
    [grid.data],
  );

  /** Land on the nearest expiration whenever the window changes under us. */
  useEffect(() => {
    if (expirations.length === 0) return;
    if (expiry && expirations.includes(expiry)) return;
    setExpiry(expirations[0]);
    setSelectedStrike(null);
  }, [expirations, expiry]);

  /**
   * A target the contract can profit from.
   *
   * Set once per symbol and per side rather than on every render, so a typed
   * target survives — but flipping call to put has to move it, or a put shows
   * a target above spot and every number below reads as a loss.
   */
  useEffect(() => {
    if (spot === null) return;
    const fresh = defaultTarget(spot, optionType);
    setTarget(fresh);
    setTargetDraft(fresh.toFixed(2));
  }, [spot === null, symbol, optionType]); // eslint-disable-line react-hooks/exhaustive-deps

  const column = useMemo(
    () => (expiry ? contractsForExpiry(contracts, expiry) : []),
    [contracts, expiry],
  );

  const rows = useMemo(
    () => (spot !== null && target !== null ? scoreLadder(column, spot, target) : []),
    [column, spot, target],
  );

  /** Open at the money — a ladder opening on the deepest ITM strike buries the strikes people trade. */
  useEffect(() => {
    if (selectedStrike !== null || column.length === 0 || spot === null) return;
    setSelectedStrike(column[atmIndex(column, spot)].strike);
  }, [column, spot, selectedStrike]);

  const selected = column.find((c) => c.strike === selectedStrike) ?? null;
  const q = quote.data?.quotes[0];

  const commitSymbol = () => {
    const next = draft.trim().toUpperCase();
    if (!next || next === symbol) return;
    setSymbol(next);
    setExpOffset(0);
    setExpiry(null);
    setSelectedStrike(null);
  };

  const commitTarget = () => {
    const parsed = parseFloat(targetDraft);
    if (Number.isFinite(parsed) && parsed > 0) setTarget(parsed);
    else if (target !== null) setTargetDraft(target.toFixed(2));
  };

  const applyPreset = (percent: number) => {
    if (spot === null) return;
    const next = defaultTarget(spot, optionType, percent);
    setTarget(next);
    setTargetDraft(next.toFixed(2));
  };

  const activePreset = (percent: number) =>
    spot !== null && target !== null && Math.abs(target - defaultTarget(spot, optionType, percent)) < 0.005;

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
          placeholder="MU"
          placeholderTextColor={colors.textMuted}
          style={styles.symbolInput}
          accessibilityLabel="Underlying symbol"
        />
        {q && (
          <View style={styles.quote}>
            <Text style={styles.quotePrice}>${formatPrice(q.price)}</Text>
            <Text style={[styles.quoteChange, { color: changeColor(q.changePercent) }]}>
              {formatPercent(q.changePercent)}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.typeRow}>
        {(['call', 'put'] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => {
              if (t === optionType) return;
              setOptionType(t);
              setSelectedStrike(null);
            }}
            style={[
              styles.typeButton,
              optionType === t && (t === 'call' ? styles.typeCall : styles.typePut),
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: optionType === t }}
          >
            <Text
              style={[
                styles.typeText,
                optionType === t && {
                  color: t === 'call' ? colors.emeraldBright : colors.rose,
                },
              ]}
            >
              {t === 'call' ? 'Call' : 'Put'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.targetBlock}>
        <Text style={styles.sectionLabel}>PRICE TARGET</Text>
        <View style={styles.targetRow}>
          <View style={styles.targetInputWrap}>
            <Text style={styles.dollar}>$</Text>
            <TextInput
              value={targetDraft}
              onChangeText={setTargetDraft}
              onSubmitEditing={commitTarget}
              onBlur={commitTarget}
              keyboardType="decimal-pad"
              returnKeyType="done"
              style={styles.targetInput}
              accessibilityLabel="Price target"
            />
          </View>
          <View style={styles.presets}>
            {[5, 10, 15, 20].map((pct) => (
              <Pressable
                key={pct}
                onPress={() => applyPreset(pct)}
                style={[styles.preset, activePreset(pct) && styles.presetActive]}
                accessibilityRole="button"
              >
                <Text style={[styles.presetText, activePreset(pct) && styles.presetTextActive]}>
                  {optionType === 'put' ? '−' : '+'}
                  {pct}%
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      <ExpirationStrip
        expirations={expirations}
        selected={expiry}
        onSelect={(e) => {
          setExpiry(e);
          setSelectedStrike(null);
        }}
        canGoBack={expOffset > 0}
        canGoForward={(grid.data?.allExpirations.length ?? 0) > expOffset + EXPIRATION_WINDOW}
        onPage={(delta) => {
          setExpOffset((o) => Math.max(0, o + delta * EXPIRATION_WINDOW));
          setExpiry(null);
          setSelectedStrike(null);
        }}
      />

      {grid.isLoading && (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>
            Pricing {EXPIRATION_WINDOW} expirations — the first load on a wide underlying is slow.
          </Text>
        </View>
      )}

      {grid.error && !grid.isLoading && (
        <Text style={styles.error}>{(grid.error as Error).message}</Text>
      )}

      {!grid.isLoading && spot !== null && target !== null && (
        <StrikeLadder
          rows={rows}
          underlyingPrice={spot}
          selectedStrike={selectedStrike}
          onSelect={(c: WireOptionContract) => setSelectedStrike(c.strike)}
        />
      )}

      {selected && spot !== null && target !== null && (
        <ContractDetail contract={selected} underlyingPrice={spot} targetPrice={target} />
      )}
    </ScrollView>
  );
}

function ExpirationStrip({
  expirations,
  selected,
  onSelect,
  canGoBack,
  canGoForward,
  onPage,
}: {
  expirations: string[];
  selected: string | null;
  onSelect: (expiry: string) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onPage: (delta: number) => void;
}) {
  if (expirations.length === 0) return null;

  return (
    <View style={styles.expStrip}>
      <Pager label="‹" enabled={canGoBack} onPress={() => onPage(-1)} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.expList}>
        {expirations.map((exp) => (
          <Pressable
            key={exp}
            onPress={() => onSelect(exp)}
            style={[styles.expChip, selected === exp && styles.expChipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: selected === exp }}
          >
            <Text style={[styles.expText, selected === exp && styles.expTextActive]}>
              {shortDate(exp)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Pager label="›" enabled={canGoForward} onPress={() => onPage(1)} />
    </View>
  );
}

function Pager({ label, enabled, onPress }: { label: string; enabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={enabled ? onPress : undefined}
      disabled={!enabled}
      hitSlop={8}
      style={styles.pager}
      accessibilityRole="button"
      accessibilityLabel={label === '‹' ? 'Earlier expirations' : 'Later expirations'}
    >
      <Text style={[styles.pagerText, !enabled && styles.pagerDisabled]}>{label}</Text>
    </Pressable>
  );
}

function shortDate(iso: string): string {
  // Parsed as UTC and formatted as UTC: an expiration is a calendar date, and
  // letting a west-coast device shift it renders Sep 18 as Sep 17.
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
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

  typeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  typeButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
  },
  typeCall: { borderColor: colors.emerald, backgroundColor: 'rgba(16,185,129,0.12)' },
  typePut: { borderColor: colors.rose, backgroundColor: 'rgba(244,63,94,0.12)' },
  typeText: { color: colors.textSecondary, fontFamily: fonts.mono, fontSize: 14, fontWeight: '600' },

  targetBlock: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  sectionLabel: {
    color: colors.textTertiary,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  targetRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  targetInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderDefault,
    paddingHorizontal: spacing.md,
  },
  dollar: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 14 },
  targetInput: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: 16,
    paddingVertical: spacing.sm,
    paddingLeft: 2,
  },
  presets: { flexDirection: 'row', gap: 2 },
  preset: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, borderRadius: radii.sm },
  presetActive: { backgroundColor: 'rgba(139,92,246,0.18)' },
  presetText: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 11 },
  presetTextActive: { color: colors.violet },

  expStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  expList: { gap: spacing.sm, paddingHorizontal: spacing.xs },
  expChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  expChipActive: { borderColor: colors.accent, backgroundColor: 'rgba(59,130,246,0.15)' },
  expText: { color: colors.textSecondary, fontFamily: fonts.mono, fontSize: 12 },
  expTextActive: { color: colors.accentBright },
  pager: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  pagerText: { color: colors.textSecondary, fontSize: 20, lineHeight: 22 },
  pagerDisabled: { color: colors.textMuted },

  loading: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  loadingText: {
    color: colors.textTertiary,
    fontSize: 11,
    paddingHorizontal: spacing.xl,
    textAlign: 'center',
  },
  error: { color: colors.rose, fontSize: 13, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
});
