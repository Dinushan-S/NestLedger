import { useThemedStyles, type AppTheme } from '@/lib/theme-context';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
};

export default function StatPill({ label, value, sub, valueColor }: Props) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, valueColor ? { color: valueColor } : undefined]}>{value}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    backgroundColor: theme.surface,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
  },
  label: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  value: {
    color: theme.text,
    fontSize: 17,
    fontWeight: '700',
  },
  sub: {
    color: theme.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
});
