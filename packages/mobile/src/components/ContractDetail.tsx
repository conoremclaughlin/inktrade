import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { analyzeLeverage, estimateLeverage, reviveContract } from '@inktrade/engine/math';
import { isModelled, type WireOptionContract } from '@inktrade/client';
import { colors, fonts, formatMoney, radii, spacing } from '../ui/theme';

/**
 * What one contract actually costs, risks, and pays.
 *
 * Computed on the device rather than fetched. It is the same `analyzeLeverage`
 * the /api/leverage route runs — pure Black-Scholes over a 50-point surface,
 * cheap enough that a round trip would cost more than the maths. It also means
 * the panel keeps working from a cached grid with no connection, which is the
 * normal condition for a phone.
 */
export function ContractDetail({
  contract: wire,
  underlyingPrice,
  targetPrice,
}: {
  contract: WireOptionContract;
  underlyingPrice: number;
  targetPrice: number;
}) {
  const modelled = isModelled(wire);

  const model = useMemo(() => {
    if (!modelled) return null;
    const contract = reviveContract(wire);
    return {
      contract,
      analysis: analyzeLeverage({
        underlying: wire.underlying,
        underlyingPrice,
        contract,
        targets: [{ price: targetPrice }],
      }),
      leverage: estimateLeverage(contract, underlyingPrice, targetPrice),
    };
  }, [modelled, wire, underlyingPrice, targetPrice]);

  const premium = wire.mark || wire.last;
  const scenario = model?.analysis.scenarios[0];
  const { greeks } = wire;

  // Breakeven doesn't need a model — it's the strike and the premium. Worth
  // showing even when nothing else can be computed, because it's the one
  // number that still tells you what the trade needs.
  const breakeven = wire.type === 'call' ? wire.strike + premium : wire.strike - premium;

  // Per contract, not per share. An option quoted at $5.20 costs $520, and
  // quoting the P&L per share next to a premium per share is how people
  // misjudge position size by two orders of magnitude.
  const costPerContract = premium * 100;
  const pnlPerContract = scenario ? scenario.pnl * 100 : null;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>
          {wire.underlying} {wire.strike} {wire.type === 'call' ? 'C' : 'P'}
        </Text>
        <Text style={styles.subtitle}>
          {formatExpiry(wire.expiration)} · {wire.daysToExpiration}d
        </Text>
      </View>

      <View style={styles.grid}>
        <Stat
          label="LEVERAGE"
          value={model && model.leverage > 0 ? `${model.leverage.toFixed(1)}x` : '—'}
          tone={colors.accentBright}
        />
        <Stat label="BREAKEVEN" value={`$${breakeven.toFixed(2)}`} />
        <Stat label="COST" value={formatMoney(costPerContract)} />
        <Stat label="MAX RISK" value={formatMoney(-costPerContract)} tone={colors.rose} />
      </View>

      {scenario && pnlPerContract !== null && (
        <View style={styles.target}>
          <Text style={styles.targetLabel}>
            At ${targetPrice.toFixed(2)} ({signedPercent(((targetPrice / underlyingPrice) - 1) * 100)})
          </Text>
          <Text
            style={[
              styles.targetValue,
              { color: pnlPerContract >= 0 ? colors.emeraldBright : colors.rose },
            ]}
          >
            {pnlPerContract >= 0 ? '+' : ''}
            {formatMoney(pnlPerContract)}{' '}
            <Text style={styles.targetPercent}>
              ({signedPercent(scenario.pnlPercent)})
            </Text>
          </Text>
        </View>
      )}

      <View style={styles.greeks}>
        <Greek label="Δ" value={modelled ? greeks.delta.toFixed(3) : '—'} />
        <Greek label="Γ" value={modelled ? greeks.gamma.toFixed(4) : '—'} />
        <Greek label="Θ" value={modelled ? greeks.theta.toFixed(3) : '—'} />
        <Greek label="ν" value={modelled ? greeks.vega.toFixed(3) : '—'} />
        <Greek
          label="IV"
          value={modelled ? `${(greeks.impliedVolatility * 100).toFixed(1)}%` : '—'}
        />
      </View>

      {!modelled && (
        <Text style={styles.caveat}>
          This strike couldn&apos;t be valued — no usable price, so there are no Greeks,
          no leverage and no probability to show.
        </Text>
      )}

      {/*
        The premium is a model mark when the book is empty. Saying so matters:
        an illiquid strike can show a tidy leverage number that no one will
        actually fill at.
      */}
      {wire.bid <= 0 && wire.ask <= 0 && (
        <Text style={styles.caveat}>
          No bid or ask on this strike — the premium is a model price, not a fill.
        </Text>
      )}

      {/* daysToExpiration reads 0 on expiration day, where the maths degenerates. */}
      {wire.daysToExpiration <= 0 && (
        <Text style={styles.caveat}>Expires today — leverage and probability are undefined.</Text>
      )}
    </View>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tone ? { color: tone } : null]}>{value}</Text>
    </View>
  );
}

function Greek({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.greek}>
      <Text style={styles.greekLabel}>{label}</Text>
      <Text style={styles.greekValue}>{value}</Text>
    </View>
  );
}

function signedPercent(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const styles = StyleSheet.create({
  card: {
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderDefault,
    gap: spacing.md,
  },
  head: { gap: 2 },
  title: { color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 16, fontWeight: '700' },
  subtitle: { color: colors.textTertiary, fontSize: 11 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md },
  stat: { width: '50%' },
  statLabel: { color: colors.textTertiary, fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1 },
  statValue: {
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: 15,
    marginTop: 2,
  },

  target: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    paddingTop: spacing.md,
  },
  targetLabel: { color: colors.textTertiary, fontSize: 11 },
  targetValue: { fontFamily: fonts.mono, fontSize: 18, fontWeight: '700', marginTop: 2 },
  targetPercent: { fontSize: 13, fontWeight: '400' },

  greeks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    paddingTop: spacing.md,
  },
  greek: { alignItems: 'center' },
  greekLabel: { color: colors.textTertiary, fontFamily: fonts.mono, fontSize: 11 },
  greekValue: { color: colors.textSecondary, fontFamily: fonts.mono, fontSize: 12, marginTop: 2 },

  caveat: { color: colors.amber, fontSize: 11, lineHeight: 15 },
});
