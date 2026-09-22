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
    // KeyboardAvoidingView must be the outermost flex container so it can lift
    // the bottom-anchored card above the keyboard. It also needs a real
    // behavior on Android: this sheet renders inside a transparent <Modal>,
    // whose window does NOT resize for the keyboard, so without this the lower
    // text fields end up hidden behind the keyboard.
    <KeyboardAvoidingView
      behavior="padding"
      style={styles.keyboardWrapper}
    >
      <View style={styles.sheetBackdrop}>
        <Pressable
          accessibilityLabel="Close bottom sheet"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.sheetCard}>
          <View style={styles.sheetGrabber} />
          {scrollable ? (
            <ScrollView
              contentContainerStyle={styles.sheetContent}
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              style={styles.sheetScroll}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={styles.nonScrollContent}>{children}</View>
          )}
        </View>
      </View>
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
  sheetScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  nonScrollContent: {
    flex: 1,
    minHeight: 0,
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
