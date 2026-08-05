import { useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../constants/nestledger';
import BentoCard from '../ui/BentoCard';
import { styles } from './nestledger.styles';

// Small presentational components extracted from NestLedgerApp.tsx (2026-08-05).
export function SplashScreen() {
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView style={[styles.screen, { paddingTop: insets.top }]}>
      <CenteredState body="Syncing your shared home space..." title="NestLedger" />
    </SafeAreaView>
  );
}

export function CenteredState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.centerWrap}>
      <BentoCard tone="highlight" style={styles.centerCard}>
        <Text style={styles.heroTitle}>{title}</Text>
        <Text style={styles.bodyMuted}>{body}</Text>
      </BentoCard>
    </View>
  );
}

export function EmptyState({ title, body }: { body: string; title: string }) {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.bodyMuted}>{body}</Text>
    </View>
  );
}

export function DatePickerField({
  date,
  label,
  onDateChange,
  testID,
}: {
  date: string;
  label: string;
  onDateChange: (value: string) => void;
  testID?: string;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const dateObj = new Date(date);

  const formattedDate = dateObj.toLocaleDateString('en-LK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const handleChange = (event: unknown, selectedDate?: Date) => {
    setShowPicker(false);
    if (selectedDate) {
      const iso = selectedDate.toISOString().slice(0, 10);
      onDateChange(iso);
    }
  };

  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <Pressable onPress={() => setShowPicker(true)} style={styles.dateButton} testID={testID}>
        <Text style={styles.dateButtonText}>{formattedDate}</Text>
        <Ionicons color={theme.textMuted} name="calendar-outline" size={20} />
      </Pressable>
      {showPicker ? (
        <DateTimePicker
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          mode="date"
          onChange={handleChange}
          value={dateObj}
        />
      ) : null}
    </View>
  );
}

export function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoPill}>
      <Text style={styles.infoPillLabel}>{label}</Text>
      <Text style={styles.infoPillValue}>{value}</Text>
    </View>
  );
}

export function TabButton({
  active,
  badge,
  icon,
  label,
  onPress,
  testID,
}: {
  active: boolean;
  badge: number;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable hitSlop={10} onPress={onPress} style={styles.tabButton} testID={testID}>
      <View>
        <Ionicons color={active ? theme.primary : theme.textMuted} name={icon} size={22} />
        {badge ? (
          <View style={[styles.badge, styles.tabBadge]}>
            <Text style={styles.badgeText}>{Math.min(badge, 9)}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

export function QuickActionCard({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable onPress={onPress} style={styles.quickActionCard} testID={testID}>
      <Ionicons color={theme.primary} name={icon} size={22} />
      <Text style={styles.quickActionText}>{label}</Text>
    </Pressable>
  );
}

export function ConfirmModal({
  body,
  confirmText,
  destructive,
  onConfirm,
  onClose,
  title,
  visible,
}: {
  body: string;
  confirmText: string;
  destructive: boolean;
  onConfirm: () => void;
  onClose: () => void;
  title: string;
  visible: boolean;
}) {
  if (!visible) return null;

  return (
    <Modal animationType="fade" transparent visible={visible}>
      <Pressable onPress={onClose} style={styles.confirmBackdrop}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.confirmCard}>
          <View style={styles.confirmIconWrap}>
            <Ionicons color={destructive ? theme.danger : theme.warning} name={destructive ? 'trash-outline' : 'warning-outline'} size={32} />
          </View>
          <Text style={styles.confirmTitle}>{title}</Text>
          <Text style={styles.confirmBody}>{body}</Text>
          <View style={styles.confirmButtons}>
            <Pressable hitSlop={10} onPress={onClose} style={styles.confirmCancelButton}>
              <Text style={styles.confirmCancelText}>Cancel</Text>
            </Pressable>
            <Pressable hitSlop={10} onPress={onConfirm} style={[styles.confirmButton, destructive && styles.confirmDestructive]}>
              <Text style={[styles.confirmButtonText, destructive && styles.confirmDestructiveText]}>{confirmText}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

