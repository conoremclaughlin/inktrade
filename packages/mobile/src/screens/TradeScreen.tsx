import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import {
  COST_BASIS_LABELS,
  COST_BASIS_STRATEGIES,
  allPositions,
  brokerIdOf,
  optionLabel,
  type CostBasisStrategy,
  type Position,
} from '@inktrade/client';
import type { RootStackParamList, TabParamList } from '../navigation';
import { usePortfolio } from '../hooks/usePortfolio';
import {
  useBrokerQuotes,
  useCostBasis,
  useSetCostBasis,
  useTradingMode,
} from '../hooks/useTrading';
import { OrderTicket } from '../components/OrderTicket';
import { ExerciseAdvisory } from '../components/ExerciseAdvisory';
import { API_BASE_URL } from '../lib/api';
import { colors, fonts, formatMoney, radii, spacing } from '../ui/theme';

type TradeRoute = RouteProp<TabParamList, 'Trade'>;

/**
 * Trading on mobile.
 *
 * The ticket, then what you already hold in this name — because the option
 * positions are what create the exercise and assignment exposure the advisory
 * warns about. Showing the warning next to the position it concerns is the
 * difference between a notice and a nag.
 *
 * Every decision is made server-side and shared through @inktrade/client, so
 * this screen and its web counterpart cannot drift into disagreeing about what
 * an order costs or which lots it sells.
 */
export function TradeScreen() {
  const route = useRoute<TradeRoute>();
  const navigation = useNavigation();
  const [symbol, setSymbol] = useState(route.params?.symbol?.toUpperCase() ?? 'SOXL');
  const [draft, setDraft] = useState(symbol);
  const [accountId, setAccountId] = useState<string | null>(null);


  /**
   * Follow a symbol handed over from another screen.
   *
   * Trade and Chain are TABS, so their state survives navigation — the
   * useState initializer above runs once and never again. Without this,
   * tapping a strike on the chain lands on a ticket for whatever ticker
   * happened to be here already, which is a very bad way to be wrong.
   *
   * The param is cleared once consumed so arriving twice with the SAME symbol
   * still registers as a change.
   */
  useEffect(() => {
    const handedOver = route.params?.symbol?.toUpperCase();
    if (!handedOver) return;
    setSymbol(handedOver);
    setDraft(handedOver);
    navigation.setParams({ symbol: undefined });
  }, [route.params?.symbol, navigation]);

  const portfolio = usePortfolio();
  const mode = useTradingMode();
  const quotes = useBrokerQuotes([symbol]);

  const summary = portfolio.summary;
  const broker = brokerIdOf(portfolio.provider);
  const accounts = summary?.accounts ?? [];
  const account = accountId ?? accounts[0]?.accountId ?? null;

  const quote = quotes.data?.quotes?.[0];

  const related = useMemo(() => {
    const positions = summary ? allPositions(summary) : [];
    return positions.filter(
      (p) =>
        p.symbol === symbol ||
        (p.assetType === 'OPTION' && p.option?.underlyingSymbol === symbol),
    );
  }, [summary, symbol]);

  const options = related.filter((p) => p.assetType === 'OPTION' && p.option);
  const shares = related.filter((p) => p.assetType !== 'OPTION');

  if (portfolio.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={portfolio.isFetching && !portfolio.isLoading}
            onRefresh={portfolio.refetch}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.search}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => setSymbol(draft.trim().toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
            placeholder="Symbol"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
          <Pressable
            onPress={() => setSymbol(draft.trim().toUpperCase())}
            style={({ pressed }) => [styles.loadButton, pressed && styles.pressed]}
          >
            <Text style={styles.loadText}>Load</Text>
          </Pressable>
        </View>

        {portfolio.error && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>Couldn&apos;t reach the API at {API_BASE_URL}.</Text>
          </View>
        )}

        {accounts.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.accounts}
          >
            {accounts.map((a) => {
              const on = account === a.accountId;
              return (
                <Pressable
                  key={a.accountId}
                  onPress={() => setAccountId(a.accountId)}
                  style={[styles.account, on && styles.accountOn]}
                >
                  <Text style={[styles.accountText, on && styles.accountTextOn]}>
                    {a.nickname || a.accountId}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {account ? (
          <OrderTicket
            symbol={symbol}
            accountId={account}
            book={{ bid: quote?.bid ?? null, ask: quote?.ask ?? null }}
            mode={mode.data}
          />
        ) : (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              Link a brokerage in Settings on the web app to place orders.
            </Text>
          </View>
        )}

        <CostBasisRow />

        {options.length > 0 && <SectionTitle title="Options in this name" />}
        {options.map((p) => (
          <View key={`${p.symbol}-${p.option!.expiration}`}>
            <PositionCard position={p} label={optionLabel(p.option!)} />
            <ExerciseAdvisory
              broker={broker}
              option={p.option!}
              // Quantity carries the direction: a short position is the one
              // that can be assigned.
              side={p.quantity >= 0 ? 'BUY' : 'SELL'}
            />
          </View>
        ))}

        {shares.length > 0 && <SectionTitle title="Shares" />}
        {shares.map((p) => (
          <PositionCard key={p.symbol} position={p} label={p.symbol} />
        ))}

        {related.length === 0 && (
          <Text style={styles.empty}>No position in {symbol}.</Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * The default cost-basis strategy, editable in place.
 *
 * On the trade screen rather than buried in a settings tab, because it changes
 * which shares a sell consumes — it belongs where the selling happens.
 */
function CostBasisRow() {
  const basis = useCostBasis();
  const setBasis = useSetCostBasis();
  const [open, setOpen] = useState(false);

  const locked = basis.data?.source === 'env';

  return (
    <View style={styles.basis}>
      <Pressable
        onPress={() => !locked && setOpen(!open)}
        style={({ pressed }) => [styles.basisHeader, pressed && styles.pressed]}
      >
        <View style={styles.flex}>
          <Text style={styles.basisLabel}>COST BASIS</Text>
          <Text style={styles.basisValue}>
            {basis.data ? COST_BASIS_LABELS[basis.data.strategy] : '…'}
          </Text>
        </View>
        {!locked && <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>}
      </Pressable>

      {open &&
        COST_BASIS_STRATEGIES.map((strategy) => {
          const on = basis.data?.strategy === strategy;
          return (
            <Pressable
              key={strategy}
              disabled={setBasis.isPending}
              onPress={() => {
                setBasis.mutate(strategy as CostBasisStrategy);
                setOpen(false);
              }}
              style={({ pressed }) => [
                styles.basisOption,
                on && styles.basisOptionOn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.basisOptionText, on && styles.basisOptionTextOn]}>
                {COST_BASIS_LABELS[strategy]}
              </Text>
              {strategy === 'FIFO' && <Text style={styles.brokerDefault}>broker default</Text>}
            </Pressable>
          );
        })}

      {locked && (
        <Text style={styles.basisNote}>
          Set by INKTRADE_COST_BASIS for this deployment, so it can&apos;t be changed here.
        </Text>
      )}
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function PositionCard({ position, label }: { position: Position; label: string }) {
  const isOption = position.assetType === 'OPTION';
  return (
    <View style={styles.position}>
      <View style={styles.flex}>
        <Text style={styles.positionSymbol}>{label}</Text>
        <Text style={styles.positionDetail}>
          {position.quantity > 0 ? '+' : ''}
          {position.quantity} {isOption ? 'contracts' : 'shares'} · avg{' '}
          {formatMoney(position.averagePrice)}
        </Text>
      </View>
      <View style={styles.positionRight}>
        <Text style={styles.positionValue}>{formatMoney(position.marketValue)}</Text>
        <Text
          style={[
            styles.positionChange,
            { color: position.dayChangePercent >= 0 ? colors.emerald : colors.rose },
          ]}
        >
          {position.dayChangePercent >= 0 ? '+' : ''}
          {position.dayChangePercent.toFixed(2)}%
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.void },
  content: { paddingVertical: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.void,
  },
  pressed: { opacity: 0.7 },

  search: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  loadButton: {
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: 'rgba(59,130,246,0.16)',
  },
  loadText: { color: colors.accentBright, fontSize: 13, fontWeight: '700' },

  accounts: { paddingHorizontal: spacing.lg, gap: spacing.xs },
  account: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  accountOn: { borderColor: colors.accent, backgroundColor: 'rgba(59,130,246,0.14)' },
  accountText: { color: colors.textTertiary, fontFamily: fonts.mono, fontSize: 12 },
  accountTextOn: { color: colors.accentBright },

  basis: {
    marginHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.deep,
    overflow: 'hidden',
  },
  basisHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  basisLabel: {
    color: colors.textTertiary,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  basisValue: { color: colors.textPrimary, fontSize: 13, fontWeight: '600', marginTop: 3 },
  chevron: { color: colors.textMuted, fontSize: 12 },
  basisOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  basisOptionOn: { backgroundColor: 'rgba(59,130,246,0.12)' },
  basisOptionText: { color: colors.textSecondary, fontSize: 13 },
  basisOptionTextOn: { color: colors.accentBright, fontWeight: '700' },
  brokerDefault: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  basisNote: {
    color: colors.amber,
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },

  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  sectionTitle: {
    color: colors.textTertiary,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },

  position: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.deep,
    gap: spacing.md,
  },
  positionSymbol: { color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 13, fontWeight: '700' },
  positionDetail: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  positionRight: { alignItems: 'flex-end' },
  positionValue: { color: colors.textSecondary, fontFamily: fonts.mono, fontSize: 13 },
  positionChange: { fontFamily: fonts.mono, fontSize: 11, marginTop: 2 },

  banner: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.deep,
  },
  bannerText: { color: colors.textTertiary, fontSize: 12, lineHeight: 17 },
  empty: {
    color: colors.textMuted,
    fontSize: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
});
