import { StyleSheet, Text, View } from 'react-native';
import {
  alternativeToExercise,
  exerciseAdvisory,
  type BrokerId,
  type OptionDetail,
  type OrderSide,
} from '@inktrade/client';
import { colors, fonts, radii, spacing } from '../ui/theme';

/**
 * The warning that has a deadline.
 *
 * Robinhood allocates an exercise or assignment first-in-first-out, accepts no
 * lot selection, and offers no account-level setting to change it. The only
 * remedy is calling their support the same day.
 *
 * So this is built to interrupt. Everything else in the app can wait until
 * tomorrow; this cannot, and a quiet grey note would be a lie about that.
 *
 * All the logic — which events dispose of shares, which brokers this applies
 * to — lives in @inktrade/client, so this and its web counterpart cannot drift
 * into saying different things.
 */
export function ExerciseAdvisory({
  broker,
  option,
  side,
  assigned,
}: {
  broker: BrokerId;
  option: Pick<OptionDetail, 'putCall'>;
  /** BUY for a long position, SELL for a short one. */
  side: OrderSide;
  /** True once it has happened — the alternative is gone, the call is not. */
  assigned?: boolean;
}) {
  const advisory = exerciseAdvisory({ broker, putCall: option.putCall, side, assigned });
  if (!advisory) return null;

  const alternative = assigned ? null : alternativeToExercise({ putCall: option.putCall, side });

  return (
    <View style={styles.card} accessibilityRole="alert">
      <View style={styles.header}>
        <Text style={styles.mark}>▲</Text>
        <Text style={styles.title}>{advisory.title}</Text>
      </View>

      {advisory.timeCritical && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>SAME DAY ONLY</Text>
        </View>
      )}

      <Text style={styles.body}>{advisory.body}</Text>

      {advisory.action && (
        <View style={styles.action}>
          <Text style={styles.actionText}>{advisory.action}</Text>
        </View>
      )}

      {alternative && (
        <View style={styles.alternative}>
          <Text style={styles.alternativeLabel}>INSTEAD</Text>
          {alternative.steps.map((step, i) => (
            <View key={step} style={styles.step}>
              <Text style={styles.stepNumber}>{i + 1}.</Text>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
          <Text style={styles.tradeoff}>{alternative.tradeoff}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.4)',
    backgroundColor: 'rgba(244,63,94,0.08)',
    gap: spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  mark: { color: colors.rose, fontSize: 12, lineHeight: 18 },
  title: { color: colors.rose, fontSize: 14, fontWeight: '700', flex: 1, lineHeight: 18 },

  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(244,63,94,0.2)',
  },
  badgeText: { color: colors.rose, fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1.2 },

  body: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },

  action: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.25)',
    backgroundColor: 'rgba(244,63,94,0.07)',
  },
  actionText: { color: colors.rose, fontSize: 12, lineHeight: 18 },

  alternative: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.deep,
    gap: 4,
  },
  alternativeLabel: {
    color: colors.textTertiary,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  step: { flexDirection: 'row', gap: spacing.sm },
  stepNumber: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 12 },
  stepText: { color: colors.textSecondary, fontSize: 12, flex: 1, lineHeight: 17 },
  tradeoff: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 4 },
});
