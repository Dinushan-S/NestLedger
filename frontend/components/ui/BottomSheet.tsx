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
  const content = scrollable ? (
    <ScrollView
      contentContainerStyle={styles.sheetContent}
      keyboardShouldPersistTaps="handled"
      style={styles.sheetScroll}
      showsVerticalScrollIndicator
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.sheetContentStatic}>{children}</View>
  );

  return (
    <Pressable onPress={onClose} style={styles.sheetBackdrop}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', default: undefined })}
        style={[styles.sheetCard, !scrollable && styles.sheetCardStatic]}
      >
        <View style={styles.sheetGrabber} />
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={[styles.sheetBody, !scrollable && styles.sheetBodyStatic]}
        >
          {content}
        </Pressable>
      </KeyboardAvoidingView>
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
  sheetCardStatic: {
    height: '88%',
  },
  sheetBody: {
    maxHeight: '100%',
  },
  sheetBodyStatic: {
    flex: 1,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetContent: {
    gap: 14,
    paddingBottom: 32,
  },
  sheetContentStatic: {
    flex: 1,
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
