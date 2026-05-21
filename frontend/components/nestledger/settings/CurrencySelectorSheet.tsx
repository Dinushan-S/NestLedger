import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { theme } from '@/constants/nestledger';

import { BottomSheet } from '@/components/ui/BottomSheet';

import {
  buildCurrencySections,
  buildCurrencyViewModels,
  type CurrencyOptionViewModel,
} from './currencySelector';

const defaultPopularCodes = ['USD', 'EUR', 'GBP', 'LKR', 'INR', 'JPY'];
const currencyViewModels = buildCurrencyViewModels();

type CurrencySelectorSheetProps = {
  onChange: (value: string) => void;
  onClose: () => void;
  popularCodes?: string[];
  value: string;
  visible: boolean;
};

export function CurrencySelectorSheet({
  onChange,
  onClose,
  popularCodes = defaultPopularCodes,
  value,
  visible,
}: CurrencySelectorSheetProps) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (!visible) {
      setQuery('');
    }
  }, [visible]);

  const sections = useMemo(
    () =>
      buildCurrencySections({
        currentCode: value,
        popularCodes,
        query: deferredQuery,
        viewModels: currencyViewModels,
      }),
    [deferredQuery, popularCodes, value],
  );

  return (
    <Modal animationType="slide" transparent visible={visible}>
      <BottomSheet onClose={onClose} scrollable={false}>
        <SectionList
          extraData={value}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.code}
          keyboardDismissMode="on-drag"
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Text style={styles.title}>Choose currency</Text>
              <Text style={styles.subtitle}>
                Pick the currency used for your budgets, expenses, bills, and savings views.
              </Text>
              <TextInput
                onChangeText={setQuery}
                placeholder="Search currencies"
                placeholderTextColor={theme.textMuted}
                style={styles.searchInput}
                value={query}
              />
            </View>
          }
          renderItem={({ item }) => (
            <CurrencyRow
              item={item}
              onPress={() => {
                onChange(item.code);
                onClose();
              }}
              selected={item.code === value}
            />
          )}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionTitle}>{section.title}</Text>
          )}
          sections={sections}
          stickySectionHeadersEnabled={false}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No currencies found</Text>
              <Text style={styles.emptyBody}>Try searching by code, name, or symbol.</Text>
            </View>
          }
        />
      </BottomSheet>
    </Modal>
  );
}

function CurrencyRow({
  item,
  onPress,
  selected,
}: {
  item: CurrencyOptionViewModel;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, selected && styles.rowSelected]}
      testID={`currency-option-${item.code}`}
    >
      <View style={styles.rowCopy}>
        <Text style={[styles.rowCode, selected && styles.rowCodeSelected]}>{item.code}</Text>
        <Text style={styles.rowName}>{item.name}</Text>
      </View>
      <Text style={[styles.rowSymbol, selected && styles.rowCodeSelected]}>{item.symbol}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  emptyBody: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 24,
  },
  emptyTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '700',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 32,
  },
  listHeader: {
    marginBottom: 4,
  },
  row: {
    alignItems: 'center',
    backgroundColor: theme.surfaceMuted,
    borderColor: theme.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowCode: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '700',
  },
  rowCodeSelected: {
    color: theme.primary,
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    color: theme.textMuted,
    fontSize: 13,
  },
  rowSelected: {
    backgroundColor: theme.primarySoft,
    borderColor: theme.primary,
  },
  rowSymbol: {
    color: theme.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  searchInput: {
    backgroundColor: theme.surfaceMuted,
    borderColor: theme.border,
    borderRadius: 16,
    borderWidth: 1,
    color: theme.text,
    fontSize: 15,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sectionTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
    marginTop: 10,
  },
  subtitle: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  title: {
    color: theme.text,
    fontSize: 22,
    fontWeight: '800',
  },
});
