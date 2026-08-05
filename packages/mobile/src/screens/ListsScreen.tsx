import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Quote } from '@inktrade/client';
import type { RootStackParamList } from '../navigation';
import { useListQuotes, useLists } from '../hooks/useLists';
import { API_BASE_URL, API_URL_HINT } from '../lib/api';
import { PositionRow } from '../components/PositionRow';
import { colors, fonts, radii, spacing } from '../ui/theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ListsScreen() {
  const navigation = useNavigation<Nav>();
  const { lists, isLoading, addSymbol, removeSymbol } = useLists();
  const { data, isFetching, refetch, error } = useListQuotes(lists);
  const [activeInput, setActiveInput] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const quotes = useMemo(() => {
    const map = new Map<string, Quote>();
    for (const q of data?.quotes ?? []) map.set(q.symbol, q);
    return map;
  }, [data]);

  const sections = useMemo(
    () => lists.map((l) => ({ list: l, title: l.name, data: l.symbols })),
    [lists],
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const submit = (listId: string) => {
    addSymbol(listId, draft);
    setDraft('');
    setActiveInput(null);
  };

  return (
    <View style={styles.container}>
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>Couldn&apos;t reach the API at {API_BASE_URL}</Text>
          {API_URL_HINT && <Text style={styles.errorHint}>{API_URL_HINT}</Text>}
        </View>
      )}

      <SectionList
        sections={sections}
        keyExtractor={(symbol, i) => `${symbol}-${i}`}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.accent} />
        }
        contentContainerStyle={styles.content}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Pressable
              onPress={() => {
                setActiveInput(activeInput === section.list.id ? null : section.list.id);
                setDraft('');
              }}
              hitSlop={10}
            >
              <Text style={styles.addToggle}>{activeInput === section.list.id ? '×' : '+'}</Text>
            </Pressable>
          </View>
        )}
        renderSectionFooter={({ section }) =>
          activeInput === section.list.id ? (
            <View style={styles.addRow}>
              <TextInput
                value={draft}
                onChangeText={(t) => setDraft(t.toUpperCase())}
                placeholder={`Add to ${section.title}`}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                autoCorrect={false}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => submit(section.list.id)}
                style={styles.input}
              />
              <Pressable
                onPress={() => submit(section.list.id)}
                disabled={!draft.trim()}
                style={({ pressed }) => [
                  styles.addButton,
                  !draft.trim() && styles.addDisabled,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Text style={styles.addButtonText}>Add</Text>
              </Pressable>
            </View>
          ) : section.data.length === 0 ? (
            <Text style={styles.emptyList}>Nothing here yet</Text>
          ) : null
        }
        renderItem={({ item }) => {
          const q = quotes.get(item);
          return (
            <PositionRow
              symbol={item}
              value={q?.price ?? 0}
              changePercent={q?.changePercent ?? 0}
              pending={!q}
              onPress={() => navigation.navigate('Stock', { symbol: item })}
            />
          );
        }}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyList}>No lists yet</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.void },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl },
  content: { paddingBottom: spacing.xxl },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xs,
  },
  sectionTitle: {
    color: colors.textTertiary,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  addToggle: { color: colors.accentBright, fontSize: 18, lineHeight: 20, fontWeight: '600' },

  addRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
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
  addDisabled: { opacity: 0.35 },
  addButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  emptyList: {
    color: colors.textMuted,
    fontSize: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },

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
