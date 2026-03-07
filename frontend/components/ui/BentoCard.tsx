import { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { theme } from '../../constants/nestledger';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'default' | 'highlight';
};

export default function BentoCard({ children, style, tone = 'default' }: Props) {
  return <View style={[styles.card, tone === 'highlight' && styles.highlight, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 28,
    borderWidth: 1,
    padding: 18,
    shadowColor: '#2D312F',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 3,
  },
  highlight: {
    backgroundColor: theme.primarySoft,
    borderColor: '#D5E3DA',
  },
});