import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewToken,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { OptionContract } from '@inktrade/client';
import { useChainQuotes } from '@inktrade/client/hooks';
import type { TabParamList } from '../navigation';
import { useOptionChain } from '../hooks/useTrading';
import { api } from '../lib/api';
import { colors, fonts, formatMoney, radii, spacing } from '../ui/theme';

type ChainRoute = RouteProp<TabParamList, 'Chain'>;
// Chain and Trade are sibling tabs, so this navigates by bare name.
type Nav = BottomTabNavigationProp<TabParamList>;

/** One strike, with its call and put side by side. */
interface StrikeRow {
  strike: number;
  call?: OptionContract;
  put?: OptionContract;
}

/**
 * The option chain.
 *
 * Calls left, strike centre, puts right — the layout every trading platform
 * uses, because comparing the two sides at a strike is the whole point.
 *
 * Prices arrive progressively. The chain returns hundreds of contract
 * definitions but prices only a window around the money, so unpriced rows
 * fetch their own quotes as they scroll into view. That logic is shared with
 * web in @inktrade/client; only the trigger differs — a FlatList reports
 * viewable items where the browser uses an IntersectionObserver.
 */
export function ChainScreen() {
  const route = useRoute<ChainRoute>();
  const navigation = useNavigation<Nav>();

  const [symbol, setSymbol] = useState(route.params?.symbol?.toUpperCase() ?? 'MU');
  const [draft, setDraft] = useState(symbol);
  const [expiration, setExpiration] = useState<string | undefined>(undefined);
  /**
   * Which strike is showing its detail.
   *
   * Tapping a strike used to open an equity ticket for the underlying — you
   * tapped an 890 call and got a ticket for the stock, which is a small lie.
   * Option orders can't be placed at all until the agent-tradable account has
   * options approval, so until then a tap shows the contract instead of
   * pretending to trade it.
   */
  const [openStrike, setOpenStrike] = useState<number | null>(null);


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
    setExpiration(undefined);
    navigation.setParams({ symbol: undefined });
  }, [route.params?.symbol, navigation]);

  const chain = useOptionChain(symbol, expiration);
  const contracts = useMemo(() => chain.data?.contracts ?? [], [chain.data]);
  const { priced, revealContract, isLoadingContract } = useChainQuotes(api, contracts);

  /** Calls and puts paired by strike, ascending. */
  const rows = useMemo(() => {
    const byStrike = new Map<number, StrikeRow>();
    for (const contract of contracts) {
      const row = byStrike.get(contract.strike) ?? { strike: contract.strike };
      if (contract.putCall === 'CALL') row.call = contract;
      else row.put = contract;
      byStrike.set(contract.strike, row);
    }
    return [...byStrike.values()].sort((a, b) => a.strike - b.strike);
  }, [contracts]);

  const spot = chain.data?.underlyingPrice ?? null;
  const selectedRow = rows.find((r) => r.strike === openStrike);

  /**
   * Open at the money.
   *
   * A ladder that opens on the lowest strike shows deep-in-the-money calls
   * nobody asked about, and the strikes people actually trade are a long scroll
   * away — a bug a screenshot caught on web.
   */
  const atMoneyIndex = useMemo(() => {
    if (spot === null || rows.length === 0) return 0;
    let best = 0;
    let bestGap = Infinity;
    rows.forEach((row, i) => {
      const gap = Math.abs(row.strike - spot);
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    });
    return best;
  }, [rows, spot]);

  /**
   * The mobile equivalent of web's IntersectionObserver.
   *
   * Held in a ref and never reassigned: FlatList captures this handler on
   * mount and throws if its identity changes. The indirection through
   * `reveal` keeps the latest callback reachable without swapping the handler
   * itself.
   */
  const reveal = useRef(revealContract);
  reveal.current = revealContract;

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    for (const item of viewableItems) {
      const row = item.item as StrikeRow;
      if (row.call) reveal.current(row.call.id);
      if (row.put) reveal.current(row.put.id);
    }
  });

  const load = useCallback(() => {
    const next = draft.trim().toUpperCase();
    if (!next) return;
    setSymbol(next);
    // The old expiration almost certainly isn't listed on the new underlying;
    // clearing it falls back to the nearest, which is what a chain opens on.
    setExpiration(undefined);
  }, [draft]);

  return (
    <View style={styles.container}>
      <View style={styles.search}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={load}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="search"
          placeholder="Symbol"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
        />
        <Pressable onPress={load} style={({ pressed }) => [styles.load, pressed && styles.pressed]}>
          <Text style={styles.loadText}>Load</Text>
        </Pressable>
        {spot !== null && (
          <Pressable
            onPress={() => navigation.navigate('Trade', { symbol })}
            style={({ pressed }) => [styles.spot, pressed && styles.pressed]}
          >
            <Text style={styles.spotLabel}>{symbol}</Text>
            <Text style={styles.spotValue}>{formatMoney(spot)}</Text>
          </Pressable>
        )}
      </View>

      {chain.data && chain.data.expirations.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.expirationBar}
          contentContainerStyle={styles.expirations}
        >
          {chain.data.expirations.map((exp) => {
            const on = exp === chain.data!.expiration;
            return (
              <Pressable
                key={exp}
                onPress={() => setExpiration(exp)}
                style={[styles.expiration, on && styles.expirationOn]}
              >
                <Text style={[styles.expirationText, on && styles.expirationTextOn]}>
                  {shortDate(exp)}
                </Text>
                <Text style={[styles.expirationDays, on && styles.expirationTextOn]}>
                  {daysTo(exp)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.headerRow}>
        <Text style={[styles.headerCell, styles.side]}>CALLS</Text>
        <Text style={[styles.headerCell, styles.strikeCell]}>STRIKE</Text>
        <Text style={[styles.headerCell, styles.side]}>PUTS</Text>
      </View>

      {chain.isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
          {/*
            A bare spinner is the wrong answer here. An uncached chain on a
            wide underlying takes upwards of a minute upstream, and silence for
            that long reads as a hang — people back out before it lands.
          */}
          <Text style={styles.loadingLabel}>Loading the {symbol} ladder</Text>
          <Text style={styles.loadingNote}>
            A ladder the app hasn&apos;t seen before can take a minute to arrive.
          </Text>
        </View>
      ) : chain.error ? (
        <Text style={styles.empty}>Couldn&apos;t load the chain for {symbol}.</Text>
      ) : rows.length === 0 ? (
        // A request that succeeds with no contracts is not an error, so the
        // error branch never fires — an unknown ticker just rendered a blank
        // screen with no explanation.
        <Text style={styles.empty}>
          No option contracts for {symbol}. Check the symbol, or try another
          expiration.
        </Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => String(row.strike)}
          initialScrollIndex={atMoneyIndex}
          /*
            Every row is the same height, so the list jumps straight to the
            money without measuring several hundred strikes.

            This is why the detail sits in a panel below rather than expanding
            the row: a variable-height row invalidates getItemLayout, and
            dropping getItemLayout while initialScrollIndex is set sends
            FlatList somewhere arbitrary. It put a $889 underlying's ladder at
            strike 1050.
          */
          getItemLayout={(_, index) => ({
            length: ROW_HEIGHT,
            offset: ROW_HEIGHT * index,
            index,
          })}
          onViewableItemsChanged={onViewableItemsChanged.current}
          viewabilityConfig={VIEWABILITY}
          initialNumToRender={20}
          windowSize={7}
          renderItem={({ item }) => (
            <StrikeRowView
              row={item}
              spot={spot}
              priced={priced}
              isLoadingContract={isLoadingContract}
              selected={openStrike === item.strike}
              onPress={() => setOpenStrike(openStrike === item.strike ? null : item.strike)}
            />
          )}
        />
      )}

      {selectedRow && (
        <View style={styles.detail}>
          <View style={styles.detailHeader}>
            <Text style={styles.detailStrike}>{selectedRow.strike} strike</Text>
            <Pressable onPress={() => setOpenStrike(null)} hitSlop={12}>
              <Text style={styles.detailClose}>Close</Text>
            </Pressable>
          </View>
          <View style={styles.detailCols}>
            <ContractDetail
              contract={
                selectedRow.call ? (priced.get(selectedRow.call.id) ?? selectedRow.call) : undefined
              }
              label="Call"
            />
            <ContractDetail
              contract={
                selectedRow.put ? (priced.get(selectedRow.put.id) ?? selectedRow.put) : undefined
              }
              label="Put"
            />
          </View>
        </View>
      )}
    </View>
  );
}

const ROW_HEIGHT = 44;

/**
 * A row counts as seen once half of it is on screen.
 *
 * Lower would fire on rows barely clipping the edge and spend a request per
 * flick; higher would leave a visible row showing dashes.
 */
const VIEWABILITY = { itemVisiblePercentThreshold: 50 };

function StrikeRowView({
  row,
  spot,
  priced,
  isLoadingContract,
  selected,
  onPress,
}: {
  row: StrikeRow;
  spot: number | null;
  priced: Map<string, OptionContract>;
  isLoadingContract: (id: string) => boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const call = row.call ? (priced.get(row.call.id) ?? row.call) : undefined;
  const put = row.put ? (priced.get(row.put.id) ?? row.put) : undefined;

  // In the money: calls below spot, puts above.
  const callItm = spot !== null && row.strike < spot;
  const putItm = spot !== null && row.strike > spot;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.pressed]}
    >
      <Side
        contract={call}
        inTheMoney={callItm}
        loading={row.call ? isLoadingContract(row.call.id) : false}
      />
      <Text style={[styles.strikeCell, selected && styles.strikeSelected]}>{row.strike}</Text>
      <Side
        contract={put}
        inTheMoney={putItm}
        loading={row.put ? isLoadingContract(row.put.id) : false}
      />
    </Pressable>
  );
}

/**
 * What the chain rows can't fit.
 *
 * Deliberately not a trade button. Option orders cannot be placed until the
 * agent-tradable account carries options approval, and a button that opened an
 * equity ticket for the underlying would be worse than none.
 */
function ContractDetail({
  contract,
  label,
}: {
  contract?: OptionContract;
  label: string;
}) {
  if (!contract) return null;

  return (
    <View style={styles.detailCol}>
      <Text style={styles.detailLabel}>{label}</Text>
      <DetailRow k="Bid / Ask" v={pair(contract.bid, contract.ask)} />
      <DetailRow k="Break-even" v={money(contract.breakEvenPrice)} />
      <DetailRow k="IV" v={percent(contract.impliedVolatility)} />
      <DetailRow k="Delta" v={fixed(contract.delta)} />
      <DetailRow k="Theta" v={fixed(contract.theta)} />
      <DetailRow k="Open int." v={count(contract.openInterest)} />
      <DetailRow k="Volume" v={count(contract.volume)} />
    </View>
  );
}

function DetailRow({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailKey}>{k}</Text>
      <Text style={styles.detailValue}>{v}</Text>
    </View>
  );
}

// A dash for anything the provider didn't send. Greeks are optional on the
// contract precisely so a source that lacks them can't render zeros as real.
const money = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : formatMoney(n);
const fixed = (n: number | undefined) => (n === undefined ? '—' : n.toFixed(3));
const percent = (n: number | undefined) => (n === undefined ? '—' : `${(n * 100).toFixed(1)}%`);
const count = (n: number | undefined) => (n === undefined ? '—' : n.toLocaleString('en-US'));
const pair = (bid: number | null, ask: number | null) =>
  bid === null && ask === null ? '—' : `${money(bid)} / ${money(ask)}`;

function Side({
  contract,
  inTheMoney,
  loading,
}: {
  contract?: OptionContract;
  inTheMoney: boolean;
  loading: boolean;
}) {
  if (!contract) return <View style={styles.side} />;

  return (
    <View style={[styles.side, inTheMoney && styles.itm]}>
      {contract.mark === null ? (
        // A dash, not a zero. An unpriced contract is unknown, and $0.00 on an
        // option chain reads as worthless — a very different claim.
        <Text style={styles.pending}>{loading ? '···' : '—'}</Text>
      ) : (
        <>
          <Text style={styles.mark}>{formatMoney(contract.mark)}</Text>
          {contract.delta !== undefined && (
            <Text style={styles.delta}>Δ {contract.delta.toFixed(2)}</Text>
          )}
        </>
      )}
    </View>
  );
}

/** "Aug 28" — the ladder is dense, so the year is noise. */
function shortDate(iso: string): string {
  const [, month, day] = iso.split('-');
  const name = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${name[Number(month) - 1]} ${Number(day)}`;
}

function daysTo(iso: string): string {
  const days = Math.round((Date.parse(`${iso}T16:00:00Z`) - Date.now()) / 86_400_000);
  return days <= 0 ? '0d' : `${days}d`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.void },
  pressed: { opacity: 0.65 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  loadingLabel: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.sm },
  loadingNote: { color: colors.textMuted, fontSize: 11, textAlign: 'center', lineHeight: 16 },

  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  load: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: 'rgba(59,130,246,0.16)',
  },
  loadText: { color: colors.accentBright, fontSize: 13, fontWeight: '700' },
  spot: { alignItems: 'flex-end' },
  spotLabel: {
    color: colors.textTertiary,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1,
  },
  spotValue: { color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 15, fontWeight: '700' },

  // Fixed height so the detail panel appearing can't squeeze the ladder of
  // expirations up behind the column header.
  expirationBar: { flexGrow: 0, flexShrink: 0 },
  expirations: { paddingHorizontal: spacing.lg, gap: spacing.xs, paddingBottom: spacing.sm },
  expiration: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  expirationOn: { borderColor: colors.accent, backgroundColor: 'rgba(59,130,246,0.14)' },
  expirationText: { color: colors.textSecondary, fontFamily: fonts.mono, fontSize: 12 },
  expirationDays: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 9, marginTop: 1 },
  expirationTextOn: { color: colors.accentBright },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderDefault,
  },
  headerCell: {
    color: colors.textTertiary,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.4,
    textAlign: 'center',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_HEIGHT,
    // No horizontal padding: the in-the-money band is a full-bleed column, and
    // padding here left it stopping short of the screen edge, which reads as a
    // rendering fault rather than a margin.
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  side: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
  itm: { backgroundColor: 'rgba(59,130,246,0.07)' },
  strikeCell: {
    width: 74,
    textAlign: 'center',
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '700',
  },
  mark: { color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 13 },
  delta: { color: colors.textTertiary, fontFamily: fonts.mono, fontSize: 10, marginTop: 1 },
  pending: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 13 },

  detail: {
    flexShrink: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.deep,
    borderTopWidth: 1,
    borderTopColor: colors.borderDefault,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  detailStrike: { color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 14, fontWeight: '700' },
  detailClose: { color: colors.accentBright, fontSize: 13 },
  detailCols: { flexDirection: 'row', gap: spacing.lg },
  rowSelected: { backgroundColor: 'rgba(59,130,246,0.12)' },
  strikeSelected: { color: colors.accentBright },
  detailCol: { flex: 1, gap: 3 },
  detailLabel: {
    color: colors.accentBright,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 3,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  detailKey: { color: colors.textTertiary, fontSize: 11 },
  detailValue: { color: colors.textSecondary, fontFamily: fonts.mono, fontSize: 11 },

  empty: {
    color: colors.textMuted,
    fontSize: 12,
    padding: spacing.lg,
    textAlign: 'center',
  },
});
