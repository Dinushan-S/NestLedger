import { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
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
    // KeyboardAvoidingView must be the outermost flex container so it can lift
    // the bottom-anchored card above the keyboard. It also needs a real
    // behavior on Android: this sheet renders inside a transparent <Modal>,
    // whose window does NOT resize for the keyboard, so without this the lower
    // text fields end up hidden behind the keyboard.
    <KeyboardAvoidingView
      behavior="padding"
      style={styles.keyboardWrapper}
    >
      <Pressable onPress={onClose} style={styles.sheetBackdrop}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.sheetCard}>
          <View style={styles.sheetGrabber} />
          {scrollable ? (
            <ScrollView
              contentContainerStyle={styles.sheetContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          ) : (
            <View>{children}</View>
          )}
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardWrapper: {
    flex: 1,
  },
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
