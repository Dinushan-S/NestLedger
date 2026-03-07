import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '../../constants/nestledger';

type Props = {
  active?: boolean;
  label: string;
  onPress: () => void;
  left?: React.ReactNode;
};

export default function CategoryChip({ active, label, onPress, left }: Props) {
  return (
    <Pressable hitSlop={10} onPress={onPress} style={[styles.chip, active ? styles.activeChip : styles.idleChip]}>
      <View style={styles.content}>
        {left}
        <Text style={[styles.label, active ? styles.activeLabel : styles.idleLabel]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  activeChip: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  activeLabel: {
    color: '#FFFFFF',
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 42,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  idleChip: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
  },
  idleLabel: {
    color: theme.text,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
});