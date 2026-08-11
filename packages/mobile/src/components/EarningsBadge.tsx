import { StyleSheet, Text, View } from 'react-native';
import {
  compactCountdown,
  countdownLabel,
  daysUntil,
  earningsProximity,
  timingLabel,
  type EarningsDate,
} from '@inktrade/client';
import { colors, fonts, radii, spacing } from '../ui/theme';

/**
 * "Earnings in 12 days" as an inline marker.
 *
 * Amber rather than the green/red the rest of the app spends on gains and
 * losses: a report is neither good news nor bad, only near or far, and
 * borrowing the P/L palette for it would make a date look like a loss.
 *
 * Renders nothing past the horizon. A date three months out is true and
 * useless, and a badge on every row is a badge nobody reads.
 */
export function EarningsBadge({
  earnings,
  asOf,
}: {
  earnings: EarningsDate | null | undefined;
  asOf: string;
}) {
  if (!earnings || !asOf) return null;

  const days = daysUntil(earnings.date, asOf);
  const proximity = earningsProximity(days);
  if (proximity === 'distant' || proximity === 'past') return null;

  const urgent = proximity === 'today' || proximity === 'imminent';

  return (
    <View style={[styles.badge, urgent ? styles.urgent : styles.quiet]}>
      <Text
        style={[styles.text, urgent ? styles.urgentText : styles.quietText]}
        numberOfLines={1}
      >
        {/*
          The word survives the squeeze; only the countdown is abbreviated.
          "ER 12d" saves six characters and costs anyone who doesn't already
          know the abbreviation the entire point of the badge.
        */}
        Earnings {compactCountdown(days)}
        {earnings.isEstimate ? ' est.' : ''}
      </Text>
    </View>
  );
}

/**
 * The same fact spelled out, for a symbol's own screen where there is room to
 * name the day and the session rather than abbreviate them.
 */
export function EarningsLine({
  earnings,
  asOf,
}: {
  earnings: EarningsDate | null | undefined;
  asOf: string;
}) {
  if (!earnings || !asOf) return null;

  const days = daysUntil(earnings.date, asOf);
  const proximity = earningsProximity(days);
  if (proximity === 'distant') return null;

  const urgent = proximity === 'today' || proximity === 'imminent';
  const session = timingLabel(earnings.timing);

  return (
    <View style={[styles.line, urgent && styles.lineUrgent]}>
      <Text style={[styles.lineLabel, urgent && styles.urgentText]}>
        {days < 0 ? 'REPORTED' : 'NEXT EARNINGS'}
      </Text>
      <Text style={styles.lineValue}>{formatDay(earnings.date)}</Text>
      <Text style={styles.lineDetail}>
        {countdownLabel(days)}
        {session ? ` · ${session}` : ''}
        {earnings.isEstimate ? ' · estimated' : ''}
      </Text>
    </View>
  );
}

/**
 * Pinned to UTC. A date-only day rendered in the device's zone slides
 * backwards for anyone west of Greenwich, which is most of the people here.
 */
export function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()];
  const month = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ][date.getUTCMonth()];
  return `${weekday} ${month} ${date.getUTCDate()}`;
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  urgent: {
    borderColor: 'rgba(245, 158, 11, 0.5)',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  quiet: {
    borderColor: colors.borderDefault,
  },
  text: {
    fontFamily: fonts.mono,
    fontSize: 9,
    fontWeight: '600',
  },
  urgentText: { color: colors.amber },
  quietText: { color: colors.textTertiary },

  line: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  lineUrgent: {
    borderColor: 'rgba(245, 158, 11, 0.4)',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
  },
  lineLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.textTertiary,
  },
  lineValue: {
    fontFamily: fonts.mono,
    fontSize: 14,
    color: colors.textPrimary,
  },
  lineDetail: {
    fontSize: 12,
    color: colors.textSecondary,
  },
});
