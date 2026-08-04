import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Quote } from '@inktrade/client';
import type { RootStackParamList } from '../navigation';
import { useWatchlistQuotes, useWatchlistSymbols } from '../hooks/useWatchlist';
import { API_BASE_URL, API_URL_HINT } from '../lib/api';
import { changeColor, colors, fonts, formatPercent, formatPrice, radii, spacing } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Watchlist'>;

export function WatchlistScreen({ navigation }: Props) {
  const { symbols, isLoading, addSymbol, removeSymbol } = useWatchlistSymbols();
  const { data, isFetching, refetch, error } = useWatchlistQuotes(symbols);
  const [input, setInput] = useState('');

  const quoteMap = useMemo(() => {
    const map = new Map<string, Quote>();
    for (const q of data?.quotes ?? []) map.set(q.symbol, q);
    return map;
  }, [data]);

  const handleAdd = () => {
    const sym = input.trim().toUpperCase();
    if (!sym) return;
    addSymbol(sym);
    setInput('');
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.addRow}>
        <TextInput
          value={input}
          onChangeText={(t) => setInput(t.toUpperCase())}
          placeholder="Add symbol"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={handleAdd}
          style={styles.input}
        />
        <Pressable
          onPress={handleAdd}
          disabled={!input.trim()}
          style={({ pressed }) => [
            styles.addButton,
            !input.trim() && styles.addButtonDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>Couldn&apos;t reach the API at {API_BASE_URL}</Text>
          {API_URL_HINT && <Text style={styles.errorHint}>{API_URL_HINT}</Text>}
        </View>
      )}

      <FlatList
        data={symbols}
        keyExtractor={(s) => s}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.accent} />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>Your watchlist is empty</Text>
          </View>
        }
        renderItem={({ item }) => (
          <WatchlistRow
            symbol={item}
            quote={quoteMap.get(item)}
            onPress={() => navigation.navigate('Stock', { symbol: item })}
            onRemove={() => removeSymbol(item)}
          />
        )}
      />
    </View>
  );
}

function WatchlistRow({
  symbol,
  quote,
  onPress,
  onRemove,
}: {
  symbol: string;
  quote?: Quote;
  onPress: () => void;
  onRemove: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onRemove}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowLeft}>
        <Text style={styles.symbol}>{symbol}</Text>
      </View>
      <View style={styles.rowRight}>
        {quote ? (
          <>
            <Text style={styles.price}>{formatPrice(quote.price)}</Text>
            <Text style={[styles.change, { color: changeColor(quote.changePercent) }]}>
              {formatPercent(quote.changePercent)}
            </Text>
          </>
        ) : (
          <Text style={styles.pending}>···</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.void },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl },
  emptyText: { color: colors.textMuted, fontSize: 13 },

  addRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: 14,
  },
  addButton: {
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
  },
  addButtonDisabled: { opacity: 0.35 },
  addButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  pressed: { opacity: 0.6 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowLeft: { flex: 1 },
  rowRight: { alignItems: 'flex-end' },
  symbol: { color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 15, fontWeight: '600' },
  price: { color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 14 },
  change: { fontFamily: fonts.mono, fontSize: 12, marginTop: 1 },
  pending: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 12 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSubtle },

  errorBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.rose,
    backgroundColor: 'rgba(244,63,94,0.08)',
    gap: 4,
  },
  errorText: { color: colors.rose, fontSize: 12, fontWeight: '600' },
  errorHint: { color: colors.textTertiary, fontSize: 11, lineHeight: 15 },
});
