import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  COST_BASIS_LABELS,
  canPlaceOrders,
  orderPrices,
  priceAt,
  type OrderOutcome,
  type OrderRequest,
  type OrderReview,
  type OrderSide,
  type OrderType,
  type PriceLevel,
  type SalePlan,
  type TradingModeDecision,
} from '@inktrade/client';
import { usePlaceOrder, useReviewOrder } from '../hooks/useTrading';
import { colors, fonts, formatMoney, radii, spacing } from '../ui/theme';

interface Book {
  bid: number | null;
  ask: number | null;
}

/**
 * The order ticket.
 *
 * Two-step by construction: nothing is submitted that hasn't been reviewed,
 * because the review is where the cost, the broker's alerts and the lot plan
 * become visible. Any edit clears the review, so the number on screen always
 * describes the order about to be sent.
 *
 * Every guard here is a courtesy — the API refuses a blocked order on its own.
 * A disabled button is not a control.
 */
export function OrderTicket({
  symbol,
  accountId,
  book,
  mode,
}: {
  symbol: string;
  accountId: string;
  book: Book;
  mode?: TradingModeDecision;
}) {
  const [side, setSide] = useState<OrderSide>('BUY');
  const [type, setType] = useState<OrderType>('LIMIT');
  const [quantity, setQuantity] = useState('1');
  const [limitPrice, setLimitPrice] = useState('');
  const [level, setLevel] = useState<PriceLevel | null>(null);
  const [chosePrice, setChosePrice] = useState(false);
  const [outcome, setOutcome] = useState<OrderOutcome | null>(null);

  const review = useReviewOrder();
  const place = usePlaceOrder();

  const prices = useMemo(
    () => orderPrices({ bid: book.bid, ask: book.ask, side }),
    [book.bid, book.ask, side],
  );

  // Arrive at the marketable price — the ask to buy, the bid to sell. An empty
  // field with a greyed placeholder looks filled while leaving Review disabled
  // and giving no hint why.
  useEffect(() => {
    if (chosePrice) return;
    setLevel(prices.marketable);
  }, [prices.marketable, chosePrice]);

  useEffect(() => {
    if (!level) return;
    const next = priceAt(prices, level);
    if (next !== null) setLimitPrice(next.toFixed(2));
  }, [level, prices]);

  // Showing a cost for a different order than the one about to be sent is the
  // worst failure available here.
  useEffect(() => {
    setOutcome(null);
  }, [side, type, quantity, limitPrice]);

  const qty = Number(quantity);
  const needsLimit = type === 'LIMIT';
  const ready = Number.isFinite(qty) && qty > 0 && (!needsLimit || Number(limitPrice) > 0);
  const busy = review.isPending || place.isPending;

  const canPlace = mode ? canPlaceOrders(mode) : true;
  const reviewed = outcome?.review;
  const placeable = Boolean(reviewed) && reviewed?.acceptable !== false && canPlace && !busy;

  const order: OrderRequest = {
    accountId,
    symbol,
    side,
    type,
    quantity: qty,
    ...(needsLimit ? { limitPrice: Number(limitPrice) } : {}),
    timeInForce: 'DAY',
    session: 'REGULAR',
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Trade {symbol}</Text>
        {prices.spread !== null && (
          <Text style={styles.spread}>
            spread {formatMoney(prices.spread)} · {prices.spreadPercent?.toFixed(2)}%
          </Text>
        )}
      </View>

      <Segmented
        options={[
          { value: 'BUY', label: 'Buy' },
          { value: 'SELL', label: 'Sell' },
        ]}
        value={side}
        onChange={(v) => setSide(v as OrderSide)}
        tone={side === 'BUY' ? colors.emerald : colors.rose}
      />

      <Segmented
        options={[
          { value: 'LIMIT', label: 'Limit' },
          { value: 'MARKET', label: 'Market' },
        ]}
        value={type}
        onChange={(v) => setType(v as OrderType)}
        tone={colors.accent}
      />

      <Field label="Quantity">
        <TextInput
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="number-pad"
          style={styles.input}
          placeholderTextColor={colors.textMuted}
        />
      </Field>

      {needsLimit && (
        <>
          <Field label="Limit price">
            <Text style={styles.currency}>$</Text>
            <TextInput
              value={limitPrice}
              onChangeText={(text) => {
                setLimitPrice(text);
                setLevel(null);
                setChosePrice(true);
              }}
              keyboardType="decimal-pad"
              style={styles.input}
              placeholderTextColor={colors.textMuted}
            />
          </Field>

          {/*
            The thinkorswim convention. Prefilling one price and calling it
            "the" price is wrong half the time: the bid never fills a buy, the
            ask pays the whole spread on every one.
          */}
          <View style={styles.levels}>
            {(['BID', 'MID', 'ASK'] as PriceLevel[]).map((l) => {
              const price = priceAt(prices, l);
              const on = level === l;
              return (
                <Pressable
                  key={l}
                  disabled={price === null}
                  onPress={() => {
                    setLevel(l);
                    setChosePrice(true);
                  }}
                  style={[styles.level, on && styles.levelOn, price === null && styles.levelOff]}
                >
                  <Text style={[styles.levelLabel, on && styles.levelLabelOn]}>
                    {l}
                    {prices.marketable === l ? ' •' : ''}
                  </Text>
                  <Text style={[styles.levelPrice, on && styles.levelLabelOn]}>
                    {price === null ? '—' : formatMoney(price)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      <View style={styles.actions}>
        <Pressable
          disabled={!ready || busy}
          onPress={async () => setOutcome(await review.mutateAsync(order))}
          style={({ pressed }) => [
            styles.button,
            styles.reviewButton,
            (!ready || busy) && styles.buttonOff,
            pressed && styles.pressed,
          ]}
        >
          {review.isPending ? (
            <ActivityIndicator color={colors.textSecondary} size="small" />
          ) : (
            <Text style={styles.reviewLabel}>Review</Text>
          )}
        </Pressable>

        <Pressable
          disabled={!placeable}
          onPress={async () => setOutcome(await place.mutateAsync(order))}
          style={({ pressed }) => [
            styles.button,
            { borderColor: side === 'BUY' ? colors.emerald : colors.rose },
            {
              backgroundColor:
                side === 'BUY' ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)',
            },
            !placeable && styles.buttonOff,
            pressed && styles.pressed,
          ]}
        >
          {place.isPending ? (
            <ActivityIndicator color={colors.textPrimary} size="small" />
          ) : (
            <Text
              style={[
                styles.placeLabel,
                { color: side === 'BUY' ? colors.emeraldBright : colors.rose },
              ]}
            >
              {side === 'BUY' ? 'Buy' : 'Sell'} {symbol}
            </Text>
          )}
        </Pressable>
      </View>

      {mode && !canPlace && mode.reason && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{mode.reason}</Text>
        </View>
      )}

      {outcome?.error && (
        <View style={styles.error}>
          <Text style={styles.errorText}>{outcome.error}</Text>
        </View>
      )}

      {outcome?.receipt && (
        <View style={styles.receipt}>
          <Text style={styles.receiptTitle}>
            Order {outcome.receipt.status.toLowerCase()}
          </Text>
          <Text style={styles.receiptDetail}>
            {outcome.receipt.quantity} {outcome.receipt.symbol} · {outcome.receipt.id}
          </Text>
        </View>
      )}

      {reviewed && <ReviewPanel review={reviewed} />}
      {outcome?.plan && <PlanPanel plan={outcome.plan} />}
    </View>
  );
}

function ReviewPanel({ review }: { review: OrderReview }) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelRow}>
        <Text style={styles.panelLabel}>ESTIMATED COST</Text>
        <Text style={styles.panelValue}>
          {review.estimatedCost === null ? '—' : formatMoney(review.estimatedCost)}
        </Text>
      </View>

      {/*
        The basis is not decoration. The broker returns no cost at all, so this
        number is ours — saying which price produced it keeps it an estimate
        rather than a promise.
      */}
      {review.estimateBasis && (
        <Text style={styles.panelNote}>
          At the {review.estimateBasis.toLowerCase()}. Excludes fees; a market order fills at
          whatever the book offers.
        </Text>
      )}

      {review.warnings.map((warning) => (
        <View key={warning} style={review.acceptable ? styles.warn : styles.error}>
          <Text style={review.acceptable ? styles.warnText : styles.errorText}>{warning}</Text>
        </View>
      ))}

      {/*
        Robinhood requires this be shown verbatim wherever their market data
        appears. Not ours to paraphrase or restyle.
      */}
      {review.disclosure && <Text style={styles.disclosure}>{review.disclosure}</Text>}
    </View>
  );
}

function PlanPanel({ plan }: { plan: SalePlan }) {
  if (plan.fallback) {
    return (
      <View style={styles.error}>
        <Text style={styles.errorTitle}>Lots can&apos;t be chosen here</Text>
        <Text style={styles.errorText}>{plan.fallback.reason}</Text>
        {plan.fallback.additionalGain !== null && plan.fallback.additionalGain > 0 && (
          <Text style={styles.errorText}>
            The broker&apos;s FIFO default realizes {formatMoney(plan.fallback.additionalGain)}{' '}
            more gain than {COST_BASIS_LABELS[plan.strategy].toLowerCase()} would.
          </Text>
        )}
      </View>
    );
  }

  if (!plan.selection || plan.selection.lots.length === 0) return null;

  return (
    <View style={styles.panel}>
      <View style={styles.panelRow}>
        <Text style={styles.panelLabel}>LOTS SOLD</Text>
        <Text style={styles.panelNote}>{COST_BASIS_LABELS[plan.strategy]}</Text>
      </View>

      {plan.selection.lots.map((lot) => (
        <View key={lot.lotId} style={styles.lotRow}>
          <Text style={styles.lotQty}>
            {lot.quantity} @ {lot.costPerShare === null ? '—' : formatMoney(lot.costPerShare)}
          </Text>
          <View style={styles.lotRight}>
            {lot.origin === 'ASSIGNMENT' && (
              <View style={styles.assignedTag}>
                <Text style={styles.assignedText}>ASSIGNED</Text>
              </View>
            )}
            <Text style={styles.lotTerm}>{lot.term === 'LONG' ? 'long' : 'short'}</Text>
            <Text
              style={[
                styles.lotGain,
                { color: (lot.realizedGain ?? 0) >= 0 ? colors.emerald : colors.rose },
              ]}
            >
              {lot.realizedGain === null ? '—' : formatMoney(lot.realizedGain)}
            </Text>
          </View>
        </View>
      ))}

      {plan.selection.realizedGain !== null && (
        <View style={[styles.panelRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>Realized</Text>
          <Text
            style={[
              styles.totalValue,
              {
                color: plan.selection.realizedGain >= 0 ? colors.emerald : colors.rose,
              },
            ]}
          >
            {formatMoney(plan.selection.realizedGain)}
          </Text>
        </View>
      )}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldBox}>{children}</View>
    </View>
  );
}

function Segmented({
  options,
  value,
  onChange,
  tone,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  tone: string;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segment, on && { borderColor: tone, backgroundColor: `${tone}26` }]}
          >
            <Text style={[styles.segmentText, on && { color: tone, fontWeight: '700' }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.deep,
    gap: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  spread: { color: colors.textTertiary, fontFamily: fonts.mono, fontSize: 11 },

  segmented: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: 4,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },

  field: { gap: 6 },
  fieldLabel: {
    color: colors.textTertiary,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  currency: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 14, marginRight: 2 },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: 15,
    paddingVertical: 10,
  },

  levels: { flexDirection: 'row', gap: spacing.xs },
  level: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: 2,
  },
  levelOn: { borderColor: colors.accent, backgroundColor: 'rgba(59,130,246,0.16)' },
  levelOff: { opacity: 0.3 },
  levelLabel: {
    color: colors.textTertiary,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  levelLabelOn: { color: colors.accentBright },
  levelPrice: { color: colors.textTertiary, fontFamily: fonts.mono, fontSize: 11 },

  actions: { flexDirection: 'row', gap: spacing.sm },
  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    minHeight: 44,
  },
  reviewButton: { borderColor: colors.borderDefault },
  buttonOff: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
  reviewLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  placeLabel: { fontSize: 13, fontWeight: '700' },

  panel: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  panelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  panelLabel: {
    color: colors.textTertiary,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  panelValue: {
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: 18,
    fontWeight: '700',
  },
  panelNote: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  disclosure: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 10,
    lineHeight: 15,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    paddingTop: spacing.sm,
  },

  lotRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lotQty: { color: colors.textSecondary, fontFamily: fonts.mono, fontSize: 12 },
  lotRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  assignedTag: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(245,158,11,0.15)',
  },
  assignedText: { color: colors.amber, fontFamily: fonts.mono, fontSize: 8, letterSpacing: 0.8 },
  lotTerm: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 10 },
  lotGain: { fontFamily: fonts.mono, fontSize: 12, minWidth: 74, textAlign: 'right' },

  totalRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    paddingTop: spacing.sm,
  },
  totalLabel: { color: colors.textSecondary, fontSize: 12 },
  totalValue: { fontFamily: fonts.mono, fontSize: 14, fontWeight: '700' },

  warn: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    backgroundColor: 'rgba(245,158,11,0.08)',
  },
  warnText: { color: colors.amber, fontSize: 12, lineHeight: 17 },

  error: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.3)',
    backgroundColor: 'rgba(244,63,94,0.08)',
    gap: 4,
  },
  errorTitle: { color: colors.rose, fontSize: 13, fontWeight: '700' },
  errorText: { color: colors.rose, fontSize: 12, lineHeight: 17 },

  notice: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    backgroundColor: 'rgba(245,158,11,0.08)',
  },
  noticeText: { color: colors.amber, fontSize: 12, lineHeight: 17 },

  receipt: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    backgroundColor: 'rgba(16,185,129,0.08)',
    gap: 2,
  },
  receiptTitle: { color: colors.emeraldBright, fontSize: 13, fontWeight: '700' },
  receiptDetail: { color: colors.textTertiary, fontFamily: fonts.mono, fontSize: 11 },
});
