import { useTheme, useThemedStyles, type AppTheme } from '@/lib/theme-context';
import { StyleSheet, View } from 'react-native';

type Props = {
  progress: number;
};

export default function ProgressBar({ progress }: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const safeProgress = Math.max(0, Math.min(progress, 1));
  const fillColor = safeProgress > 0.85 ? theme.danger : safeProgress > 0.6 ? theme.warning : theme.success;

  return (
    <View style={styles.track}>
      <View style={[styles.fill, { backgroundColor: fillColor, width: `${safeProgress * 100}%` }]} />
    </View>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  fill: {
    borderRadius: 999,
    height: 10,
  },
  track: {
    backgroundColor: theme.border,
    borderRadius: 999,
    height: 10,
    overflow: 'hidden',
    width: '100%',
  },
});
