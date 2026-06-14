import { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { theme } from '@/constants/nestledger';

type BottomSheetProps = {
  children: ReactNode;
  onClose: () => void;
  scrollable?: boolean;
};

export function BottomSheet({
  children,
  onClose,
  scrollable = true,
}: BottomSheetProps) {
  return (
    <Pressable onPress={onClose} style={styles.sheetBackdrop}>
      <Pressable onPress={(e) => e.stopPropagation()} style={styles.sheetCard}>
        <KeyboardAvoidingView
          behavior={Platform.select({ ios: 'padding', default: undefined })}
        >
          <View style={styles.sheetGrabber} />
          {scrollable ? (
            <ScrollView
              contentContainerStyle={styles.sheetContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          ) : (
            <View>{children}</View>
          )}
        </KeyboardAvoidingView>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheetBackdrop: {
    backgroundColor: 'rgba(45, 49, 47, 0.35)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '88%',
    paddingHorizontal: 20,
    paddingTop: 10,
    width: '100%',
  },
  sheetContent: {
    gap: 14,
    paddingBottom: 32,
  },
  sheetGrabber: {
    alignSelf: 'center',
    backgroundColor: theme.border,
    borderRadius: 999,
    height: 4,
    marginBottom: 14,
    width: 54,
  },
});
