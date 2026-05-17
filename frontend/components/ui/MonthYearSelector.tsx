import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { monthShort, theme } from '../../constants/nestledger';
import CategoryChip from './CategoryChip';

type Props = {
  viewYear: number;
  viewMonth: number | 'current';
  onSetYear: (year: number) => void;
  onSetMonth: (month: number | 'current') => void;
  years: number[];
  hasMonthData: (month: number) => boolean;
};

export default function MonthYearSelector({
  viewYear,
  viewMonth,
  onSetYear,
  onSetMonth,
  years,
  hasMonthData,
}: Props) {
  const yearIdx = years.indexOf(viewYear);
  const isFirstYear = yearIdx <= 0;
  const isLastYear = yearIdx >= years.length - 1;

  return (
    <View style={styles.monthSelectorWrap}>
      <View style={styles.yearNavRow}>
        <Pressable
          hitSlop={10}
          onPress={() => { if (!isFirstYear) onSetYear(years[yearIdx - 1]); }}
          style={[styles.yearNavArrow, isFirstYear && styles.yearNavArrowDisabled]}
        >
          <Ionicons color={isFirstYear ? theme.border : theme.primary} name="chevron-back-outline" size={20} />
        </Pressable>
        <Text style={styles.yearNavText}>{viewYear}</Text>
        <Pressable
          hitSlop={10}
          onPress={() => { if (!isLastYear) onSetYear(years[yearIdx + 1]); }}
          style={[styles.yearNavArrow, isLastYear && styles.yearNavArrowDisabled]}
        >
          <Ionicons color={isLastYear ? theme.border : theme.primary} name="chevron-forward-outline" size={20} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthScrollRow}>
        <CategoryChip
          active={viewMonth === 'current'}
          label="Current"
          onPress={() => onSetMonth('current')}
        />
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => {
          if (!hasMonthData(m) && !(viewYear === new Date().getFullYear() && m === new Date().getMonth() + 1)) return null;
          return (
            <CategoryChip
              key={m}
              active={viewMonth === m}
              label={monthShort[m - 1]}
              onPress={() => onSetMonth(m)}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  monthSelectorWrap: {
    marginBottom: 12,
  },
  yearNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginVertical: 6,
  },
  yearNavArrow: {
    padding: 6,
  },
  yearNavArrowDisabled: {
    opacity: 0.3,
  },
  yearNavText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
    minWidth: 48,
    textAlign: 'center',
  },
  monthScrollRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
});
