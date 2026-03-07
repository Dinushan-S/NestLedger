import { ReactNode, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';

import { theme } from '../../constants/nestledger';

type Props = {
  icon?: ReactNode;
  loading?: boolean;
  onPress: () => void;
  secondary?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  text: string;
  disabled?: boolean;
};

export default function ModernButton({
  icon,
  loading,
  onPress,
  secondary,
  style,
  testID,
  text,
  disabled,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (value: number) => {
    Animated.spring(scale, {
      damping: 15,
      stiffness: 220,
      toValue: value,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        disabled={disabled || loading}
        hitSlop={10}
        onPress={onPress}
        onPressIn={() => animateTo(0.98)}
        onPressOut={() => animateTo(1)}
        testID={testID}
        style={[styles.button, secondary ? styles.secondary : styles.primary, disabled && styles.disabled]}
      >
        {loading ? (
          <ActivityIndicator color={secondary ? theme.primary : '#FFFFFF'} />
        ) : (
          <>
            {icon}
            <Text style={[styles.label, secondary ? styles.secondaryLabel : styles.primaryLabel]}>{text}</Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
  },
  primary: {
    backgroundColor: theme.primary,
  },
  primaryLabel: {
    color: '#FFFFFF',
  },
  secondary: {
    backgroundColor: theme.secondarySoft,
  },
  secondaryLabel: {
    color: theme.primary,
  },
});