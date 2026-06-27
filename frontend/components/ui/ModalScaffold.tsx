import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/lib/theme-context';

type ModalScaffoldProps = {
  children: ReactNode;
  closeTestID?: string;
  onClose: () => void;
  rightAction?: ReactNode;
  title: string;
};

export function ModalScaffold({
  children,
  closeTestID,
  onClose,
  rightAction,
  title,
}: ModalScaffoldProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  return (
    <SafeAreaView
      style={[styles.flex, { backgroundColor: theme.background, paddingTop: insets.top, paddingHorizontal: 20 }]}
    >
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <View style={styles.modalHeader}>
          <Pressable hitSlop={10} onPress={onClose} testID={closeTestID}>
            <Ionicons color={theme.text} name="close-outline" size={28} />
          </Pressable>
          <Text style={[styles.modalTitle, { color: theme.text }]}>{title}</Text>
          <View style={styles.rightActionWrap}>{rightAction}</View>
        </View>
        <ScrollView
          contentContainerStyle={styles.modalContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  modalContent: {
    gap: 16,
    paddingBottom: 36,
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  modalTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 12,
  },
  rightActionWrap: {
    minWidth: 28,
  },
});
