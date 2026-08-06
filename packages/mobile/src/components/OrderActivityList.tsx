import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { optionLabel, type OrderActivity } from '@inktrade/client';
import { colors, fonts, formatMoney, radii, spacing } from '../ui/theme';

/**
 * What you actually did in this name.
 *
 * Equity and option orders in one feed, newest first, because that is how the
 * question is asked — "what have I done in MU" doesn't distinguish.
 *
 * A multi-leg strategy is labelled as one rather than shown as its first leg
 * pretending to be the whole trade: a short put spread rendered as "185P sell"
 * is a different position from the one that was opened.
 */
export function OrderActivityList({
  orders,
  loading,
  emptyLabel,
}: {
  orders: OrderActivity[];
  loading: boolean;
  emptyLabel: string;
}) {
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="small" />
      </View>
    );
  }

  if (orders.length === 0) {
    return <Text style={styles.empty}>{emptyLabel}</Text>;
  }

  return (
    <View>
      {orders.map((order) => (
        <OrderRow key={order.id} order={order} />
      ))}
    </View>
  );
}

function OrderRow({ order }: { order: OrderActivity }) {
  const isOption = order.assetType === 'OPTION';
  const spread = (order.legCount ?? 1) > 1;

  const title = spread
    ? `${order.symbol} ${strategyLabel(order.strategy)}`
    : isOption && order.option
      ? optionLabel(order.option)
      : order.symbol;

  const unit = isOption ? (order.quantity === 1 ? 'contract' : 'contracts') : 'shares';

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <View style={styles.titleLine}>
          <Text
            style={[styles.side, { color: order.side === 'BUY' ? colors.emerald : colors.rose }]}
          >
            {order.side}
          </Text>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <Text style={styles.detail}>
          {order.quantity} {unit}
          {spread ? ` · ${order.legCount} legs` : ''} · {stamp(order.timestamp)}
        </Text>
      </View>

      <View style={styles.right}>
        {/*
          A dash, never a zero. An order that never filled has no fill price,
          and $0.00 reads as a free trade.
        */}
        <Text style={styles.price}>
          {order.price === null ? '—' : formatMoney(order.price)}
        </Text>
        <Text style={[styles.status, statusStyle(order.status)]}>{order.status}</Text>
      </View>
    </View>
  );
}

/** "short_put_spread" is the broker's word, not a person's. */
function strategyLabel(strategy: string | undefined): string {
  if (!strategy) return 'spread';
  return strategy.replace(/_/g, ' ');
}

function statusStyle(status: OrderActivity['status']) {
  switch (status) {
    case 'FILLED':
      return { color: colors.textTertiary };
    case 'REJECTED':
      return { color: colors.rose };
    case 'OPEN':
    case 'PARTIAL':
      return { color: colors.amber };
    default:
      return { color: colors.textMuted };
  }
}

/** Time within today, date beyond it — the same rule the portfolio chart uses. */
function stamp(iso: string): string {
  const then = new Date(iso);
  const sameDay = new Date().toDateString() === then.toDateString();
  return sameDay
    ? then.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  centered: { paddingVertical: spacing.lg, alignItems: 'center' },
  empty: {
    color: colors.textMuted,
    fontSize: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  left: { flex: 1, minWidth: 0 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  side: { fontFamily: fonts.mono, fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  title: { color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 13, flexShrink: 1 },
  detail: { color: colors.textTertiary, fontSize: 11, marginTop: 3 },

  right: { alignItems: 'flex-end' },
  price: { color: colors.textSecondary, fontFamily: fonts.mono, fontSize: 13 },
  status: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.8, marginTop: 3 },

  card: { borderRadius: radii.md },
});
