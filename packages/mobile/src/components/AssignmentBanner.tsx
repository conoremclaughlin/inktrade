import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { assignmentExposure, optionLabel, type BrokerId, type Position } from '@inktrade/client';
import { colors, fonts, radii, spacing } from '../ui/theme';

/**
 * One banner for every position that would sell shares FIFO.
 *
 * This replaces a full advisory card per position. That version put
 * THIRTY-SEVEN identical red cards on a real portfolio — which stops being a
 * warning and becomes wallpaper, and trains you to scroll past the one thing
 * here with a same-day deadline.
 *
 * Collapsed it is a single line. Expanded it explains the problem once and
 * lists what expires soonest, because that is when the risk stops being
 * theoretical.
 */
export function AssignmentBanner({
  positions,
  broker,
}: {
  positions: Position[];
  broker: BrokerId;
}) {
  const [open, setOpen] = useState(false);
  const exposure = assignmentExposure(positions, broker);
  const count = exposure.positions.length;

  if (count === 0) return null;

  const soonest = exposure.positions.slice(0, 5);

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${count} positions would sell your oldest shares. Tap for detail.`}
      >
        <Text style={styles.mark}>▲</Text>
        <Text style={styles.title}>
          {count} {count === 1 ? 'position' : 'positions'} would sell your oldest shares
        </Text>
        <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
      </Pressable>

      {open && (
        <View style={styles.body}>
          <Text style={styles.text}>
            If these are exercised or assigned, Robinhood allocates the shares
            first-in-first-out — the oldest and usually cheapest, realizing the largest
            possible gain. There is no setting for it and no way to specify lots.
          </Text>

          <View style={styles.action}>
            <Text style={styles.actionText}>
              Closing the contract and selling the shares as a normal order lets you choose the
              lots. If one is exercised or assigned, contact Robinhood support the same day —
              after that the allocation is final.
            </Text>
          </View>

          <Text style={styles.listLabel}>SOONEST TO EXPIRE</Text>
          {soonest.map((p) => (
            <View key={`${p.symbol}-${p.option?.expiration}`} style={styles.row}>
              <Text style={styles.rowSymbol}>{p.option ? optionLabel(p.option) : p.symbol}</Text>
              <Text style={styles.rowQty}>
                {p.quantity > 0 ? '+' : ''}
                {p.quantity}
              </Text>
            </View>
          ))}
          {count > soonest.length && (
            <Text style={styles.more}>and {count - soonest.length} more</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.4)',
    backgroundColor: 'rgba(244,63,94,0.08)',
    overflow: 'hidden',
  },
  pressed: { opacity: 0.7 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  mark: { color: colors.rose, fontSize: 12 },
  title: { color: colors.rose, fontSize: 13, fontWeight: '700', flex: 1, lineHeight: 18 },
  chevron: { color: colors.rose, fontSize: 12 },

  body: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  text: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  action: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.25)',
  },
  actionText: { color: colors.rose, fontSize: 12, lineHeight: 18 },

  listLabel: {
    color: colors.textTertiary,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowSymbol: { color: colors.textSecondary, fontFamily: fonts.mono, fontSize: 12 },
  rowQty: { color: colors.textTertiary, fontFamily: fonts.mono, fontSize: 12 },
  more: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
});
