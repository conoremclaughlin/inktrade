import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  estimateLeverage,
  leverageBand,
  probabilityBand,
  probabilityOfProfit,
  reviveContract,
  type LeverageBand,
  type ProbabilityBand,
} from '@inktrade/engine/math';
import { hasBook, isModelled, type WireOptionContract } from '@inktrade/client';
import { colors, fonts, radii, spacing } from '../ui/theme';

/*
 * The heatmap, one column at a time.
 *
 * Web shows strikes down and expirations across, which needs a wide screen to
 * be readable. A phone can't carry both axes, so the expiration becomes a
 * chip selector above and this renders the single column beneath it — the same
 * data, navigated rather than scanned.
 *
 * The band boundaries come from the engine so both platforms agree on what
 * counts as "high"; only the colours are decided here.
 */

const LEVERAGE_FILL: Record<LeverageBand, string> = {
  negative: 'rgba(244, 63, 94, 0.15)',
  minimal: 'rgba(59, 130, 246, 0.10)',
  low: 'rgba(59, 130, 246, 0.18)',
  moderate: 'rgba(59, 130, 246, 0.28)',
  high: 'rgba(96, 165, 250, 0.36)',
  strong: 'rgba(16, 185, 129, 0.32)',
  extreme: 'rgba(52, 211, 153, 0.45)',
};

const LEVERAGE_TEXT: Record<LeverageBand, string> = {
  negative: colors.rose,
  minimal: colors.textSecondary,
  low: colors.textSecondary,
  moderate: colors.accentBright,
  high: colors.accentBright,
  strong: colors.emeraldBright,
  extreme: colors.emeraldBright,
};

const PROBABILITY_TEXT: Record<ProbabilityBand, string> = {
  remote: colors.rose,
  unlikely: colors.textTertiary,
  even: colors.textSecondary,
  likely: colors.emerald,
  strong: colors.emeraldBright,
};

export interface LadderRow {
  contract: WireOptionContract;
  /** null when the contract couldn't be valued at all. */
  leverage: number | null;
  probability: number | null;
}

/**
 * Score every strike in the column.
 *
 * Exported so the screen can pick a default selection from the same numbers
 * the rows display, rather than computing leverage twice and risking the
 * highlighted row disagreeing with the detail panel.
 */
export function scoreLadder(
  contracts: WireOptionContract[],
  underlyingPrice: number,
  targetPrice: number,
): LadderRow[] {
  return contracts.map((wire) => {
    // An unmodelled contract has no volatility, so leverage and probability
    // aren't small — they don't exist. Reporting 0.0x and 0% would read as a
    // terrible trade rather than as missing data.
    if (!isModelled(wire)) return { contract: wire, leverage: null, probability: null };

    const contract = reviveContract(wire);
    return {
      contract: wire,
      leverage: estimateLeverage(contract, underlyingPrice, targetPrice),
      probability: probabilityOfProfit(contract, underlyingPrice),
    };
  });
}

export function StrikeLadder({
  rows,
  underlyingPrice,
  selectedStrike,
  onSelect,
}: {
  rows: LadderRow[];
  underlyingPrice: number;
  selectedStrike: number | null;
  onSelect: (contract: WireOptionContract) => void;
}) {
  if (rows.length === 0) {
    return <Text style={styles.empty}>No strikes listed for this expiration.</Text>;
  }

  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={[styles.headerCell, styles.strikeCol]}>STRIKE</Text>
        <Text style={[styles.headerCell, styles.numCol]}>PREM</Text>
        <Text style={[styles.headerCell, styles.numCol]}>LEV</Text>
        <Text style={[styles.headerCell, styles.numCol]}>POP</Text>
      </View>

      {rows.map(({ contract, leverage, probability }) => {
        const band = leverage === null ? null : leverageBand(leverage);
        const selected = contract.strike === selectedStrike;
        const premium = contract.mark || contract.last;

        return (
          <Pressable
            key={`${contract.strike}-${contract.expiration}`}
            onPress={() => onSelect(contract)}
            style={[
              styles.row,
              band ? { backgroundColor: LEVERAGE_FILL[band] } : styles.rowUnmodelled,
              selected && styles.rowSelected,
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              leverage === null || probability === null
                ? `Strike ${contract.strike}, not priced`
                : `Strike ${contract.strike}, leverage ${leverage.toFixed(1)} times, probability of profit ${Math.round(probability * 100)} percent`
            }
          >
            <View style={[styles.strikeCol, styles.strikeCell]}>
              <Text style={styles.strike}>{contract.strike}</Text>
              {/*
                A strike quoted off a stale print sits beside strikes quoted off
                other, differently stale prints — which is how a premium curve
                ends up rising with the strike. Marking each one is the only way
                the ladder stops reading as a single coherent snapshot.
              */}
              {!hasBook(contract) && <Text style={styles.stale}>STALE</Text>}
              {/*
                In/out of the money is read off the strike against spot rather
                than the contract's own inTheMoney flag: the flag was computed
                when the chain was fetched, and a stale one mislabels the whole
                ladder after a move.
              */}
              {isInTheMoney(contract, underlyingPrice) && <Text style={styles.itm}>ITM</Text>}
            </View>
            <Text style={[styles.value, styles.numCol]}>
              {premium > 0 ? premium.toFixed(2) : '—'}
            </Text>
            <Text
              style={[
                styles.value,
                styles.numCol,
                band ? { color: LEVERAGE_TEXT[band] } : styles.unknown,
              ]}
            >
              {leverage === null ? '—' : `${leverage.toFixed(1)}x`}
            </Text>
            <Text
              style={[
                styles.value,
                styles.numCol,
                probability === null
                  ? styles.unknown
                  : { color: PROBABILITY_TEXT[probabilityBand(probability)] },
              ]}
            >
              {probability === null ? '—' : `${Math.round(probability * 100)}%`}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function isInTheMoney(contract: WireOptionContract, underlyingPrice: number): boolean {
  return contract.type === 'call'
    ? underlyingPrice > contract.strike
    : underlyingPrice < contract.strike;
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  headerCell: {
    color: colors.textTertiary,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginBottom: 2,
    marginHorizontal: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rowSelected: {
    borderColor: colors.accentBright,
  },
  // No fill at all, so an unpriced strike reads as absent rather than as the
  // lowest band on the scale.
  rowUnmodelled: { backgroundColor: 'transparent', opacity: 0.55 },
  unknown: { color: colors.textMuted },
  strikeCol: { flex: 1.2 },
  numCol: { flex: 1, textAlign: 'right' },
  strikeCell: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  strike: {
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '600',
  },
  itm: {
    color: colors.textTertiary,
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 0.5,
  },
  stale: {
    color: colors.amber,
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 0.5,
  },
  value: {
    color: colors.textSecondary,
    fontFamily: fonts.mono,
    fontSize: 13,
  },
  empty: {
    color: colors.textMuted,
    fontSize: 13,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
});
