import { StyleSheet, View } from 'react-native';

import { theme } from '../../constants/nestledger';

type Props = {
  progress: number;
};

export default function ProgressBar({ progress }: Props) {
  const safeProgress = Math.max(0, Math.min(progress, 1));
  const fillColor = safeProgress > 0.85 ? theme.danger : safeProgress > 0.6 ? theme.warning : theme.success;

  return (
    <View style={styles.track}>
      <View style={[styles.fill, { backgroundColor: fillColor, width: `${safeProgress * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    borderRadius: 999,
    height: 10,
  },
  track: {
    backgroundColor: '#EDF0EB',
    borderRadius: 999,
    height: 10,
    overflow: 'hidden',
    width: '100%',
  },
});