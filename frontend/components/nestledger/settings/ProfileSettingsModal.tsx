import { ReactNode, useMemo, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

const PRIVACY_POLICY_URL = 'https://nest-ledger-landingpage.vercel.app/static/privacy.html';

import { CURRENCY_INFO } from '@/constants/nestledger';
import { useTheme, type ThemeMode } from '@/lib/theme-context';

import {
  AvatarPicker,
  CreateProfileForm,
  LabeledInput,
  ProfileFormFields,
  SettingsSummaryField,
} from '@/components/nestledger/forms/ProfileFormControls';
import ModernButton from '@/components/ui/ModernButton';
import { ModalScaffold } from '@/components/ui/ModalScaffold';

import { CurrencySelectorSheet } from './CurrencySelectorSheet';

export type SettingsSectionItem = {
  description?: string;
  key: string;
  title: string;
};

type ProfileSettingsModalProps = {
  actionBusy: boolean;
  contributionEnabled: boolean;
  deletingProfile: boolean;
  onChange: (value: CreateProfileForm) => void;
  onClose: () => void;
  onDeleteSpace: () => void;
  onSave: () => void;
  onSignOut: () => void;
  onToggleContribution: () => void;
  profileForm: CreateProfileForm;
  visible: boolean;
};

const SPACE_TYPES = [
  { type: 'personal',      emoji: '🙋', label: 'Personal',      desc: 'Your own spending.' },
  { type: 'family',        emoji: '🏠', label: 'Family / Home', desc: 'Household budget.' },
  { type: 'trip_family',   emoji: '✈️', label: 'Family Trip',   desc: 'Travel with family.' },
  { type: 'trip_friends',  emoji: '🧳', label: 'Friend Trip',   desc: 'Trip with friends.' },
  { type: 'shared_living', emoji: '🏡', label: 'Shared Living', desc: 'Shared house/flat.' },
] as const;

const settingsSections: SettingsSectionItem[] = [
  { key: 'personal',    title: 'Personal profile',  description: 'Your name, avatar, and default currency.' },
  { key: 'household',  title: 'Household profile', description: 'Shared name and avatar for this space.' },
  { key: 'preferences', title: 'Preferences',      description: 'Compact settings controls that avoid noisy full-list editing.' },
  { key: 'danger',     title: 'Danger zone',       description: 'Account and destructive actions live here.' },
  { key: 'about',      title: 'About & legal',     description: 'Privacy policy and app information.' },
];

// ---------------------------------------------------------------------------
// Appearance segment options
// ---------------------------------------------------------------------------
const THEME_OPTIONS: { label: string; value: ThemeMode; icon: string }[] = [
  { label: 'System', value: 'system', icon: '🌐' },
  { label: 'Light',  value: 'light',  icon: '☀️' },
  { label: 'Dark',   value: 'dark',   icon: '🌙' },
];

export function ProfileSettingsModal({
  actionBusy,
  contributionEnabled,
  deletingProfile,
  onChange,
  onClose,
  onDeleteSpace,
  onSave,
  onSignOut,
  onToggleContribution,
  profileForm,
  visible,
}: ProfileSettingsModalProps) {
  const { theme, themeMode, setThemeMode } = useTheme();
  const styles = getStyles(theme);

  const [showCurrencySelector, setShowCurrencySelector] = useState(false);
  const selectedCurrencySummary = useMemo(
    () => {
      const symbol = CURRENCY_INFO[profileForm.currency]?.symbol;
      return symbol ? `${profileForm.currency} (${symbol})` : profileForm.currency;
    },
    [profileForm.currency],
  );

  return (
    <>
      <Modal animationType="slide" presentationStyle="pageSheet" visible={visible}>
        <ModalScaffold closeTestID="close-settings-modal" onClose={onClose} title="Profile Settings">
          {/* ── Personal profile ── */}
          <SettingsSection item={settingsSections[0]}>
            <ProfileFormFields
              currencyField={
                <SettingsSummaryField
                  description="Opens a searchable picker instead of rendering the full currency list inline."
                  onPress={() => setShowCurrencySelector(true)}
                  testID="settings-open-currency-selector"
                  title="Currency"
                  value={selectedCurrencySummary}
                />
              }
              form={profileForm}
              onChange={onChange}
              userOnly
            />
          </SettingsSection>

          {/* ── Household profile ── */}
          <SettingsSection item={settingsSections[1]}>
            <LabeledInput
              label="Family profile name"
              onChangeText={(value) => onChange({ ...profileForm, familyName: value })}
              testID="settings-family-name-input"
              value={profileForm.familyName}
            />
            <Text style={styles.inputLabel}>Family avatar</Text>
            <AvatarPicker
              selected={profileForm.familyEmoji}
              onPick={(value) => onChange({ ...profileForm, familyEmoji: value })}
            />
            <Text style={styles.inputLabel}>Space type</Text>
            <View style={styles.spaceTypeGrid}>
              {SPACE_TYPES.map((st) => {
                const selected = profileForm.spaceType === st.type;
                return (
                  <Pressable
                    key={st.type}
                    onPress={() => onChange({ ...profileForm, spaceType: st.type })}
                    style={[styles.spaceTypeCard, selected && styles.spaceTypeCardActive]}
                  >
                    <Text style={styles.spaceTypeEmoji}>{st.emoji}</Text>
                    <Text style={[styles.spaceTypeLabel, selected && styles.spaceTypeLabelActive]}>{st.label}</Text>
                    <Text style={[styles.spaceTypeDesc, selected && styles.spaceTypeDescActive]}>{st.desc}</Text>
                  </Pressable>
                );
              })}
            </View>
          </SettingsSection>

          {/* ── Preferences ── */}
          <SettingsSection item={settingsSections[2]}>
            <Text style={styles.preferenceHint}>
              Amount formatting updates everywhere after you save, while keeping all existing budget and tracker logic the same.
            </Text>

            {/* Contributions toggle */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextWrap}>
                <Text style={styles.toggleLabel}>Contributions</Text>
                <Text style={styles.toggleDesc}>
                  Track who paid in expenses, add contributions to budgets, and offset borrows automatically.
                </Text>
              </View>
              <Switch
                onValueChange={onToggleContribution}
                thumbColor={contributionEnabled ? theme.primary : theme.border}
                trackColor={{ false: theme.surfaceMuted, true: theme.primarySoft }}
                value={contributionEnabled}
              />
            </View>

            {/* Appearance / dark-mode control */}
            <View style={styles.appearanceWrap}>
              <Text style={styles.toggleLabel}>Appearance</Text>
              <Text style={styles.toggleDesc}>Choose light, dark, or follow your device setting.</Text>
              <View style={styles.appearanceRow}>
                {THEME_OPTIONS.map((opt) => {
                  const active = themeMode === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setThemeMode(opt.value)}
                      style={[styles.appearanceBtn, active && styles.appearanceBtnActive]}
                      testID={`settings-theme-${opt.value}`}
                    >
                      <Text style={styles.appearanceIcon}>{opt.icon}</Text>
                      <Text style={[styles.appearanceLabel, active && styles.appearanceLabelActive]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </SettingsSection>

          {/* ── Danger zone ── */}
          <SettingsSection item={settingsSections[3]}>
            <View style={styles.actionStack}>
              <ModernButton loading={actionBusy} onPress={onSave} testID="settings-save-button" text="Save changes" />
              <ModernButton onPress={onSignOut} secondary testID="settings-signout-button" text="Sign out" />
              <ModernButton destructive loading={deletingProfile} onPress={onDeleteSpace} secondary testID="settings-delete-button" text="Delete space" />
            </View>
          </SettingsSection>

          {/* ── About & legal ── */}
          <SettingsSection item={settingsSections[4]}>
            <Pressable
              onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
              style={styles.linkRow}
              testID="settings-privacy-policy"
            >
              <View style={styles.toggleTextWrap}>
                <Text style={styles.toggleLabel}>Privacy Policy</Text>
                <Text style={styles.toggleDesc}>How NestLedger collects, uses, and protects your data.</Text>
              </View>
              <Text style={styles.linkChevron}>›</Text>
            </Pressable>
          </SettingsSection>
        </ModalScaffold>
      </Modal>

      <CurrencySelectorSheet
        onChange={(currency) => onChange({ ...profileForm, currency })}
        onClose={() => setShowCurrencySelector(false)}
        value={profileForm.currency}
        visible={showCurrencySelector}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Section scaffold — reads theme dynamically so it responds to mode changes
// ---------------------------------------------------------------------------
function SettingsSection({
  children,
  item,
}: {
  children: ReactNode;
  item: SettingsSectionItem;
}) {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{item.title}</Text>
      {item.description ? <Text style={styles.sectionDescription}>{item.description}</Text> : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Dynamic styles factory — called with the current theme object each render
// ---------------------------------------------------------------------------
const getStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    actionStack: { gap: 10 },
    linkRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
    },
    linkChevron: {
      color: theme.textMuted,
      fontSize: 22,
      fontWeight: '600',
    },
    inputLabel: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '600',
    },
    preferenceHint: {
      color: theme.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
    sectionBody: { gap: 14 },
    sectionCard: {
      backgroundColor: theme.surfaceMuted,
      borderColor: theme.border,
      borderRadius: 24,
      borderWidth: 1,
      gap: 12,
      padding: 16,
    },
    sectionDescription: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 19,
    },
    sectionTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '800',
    },
    toggleRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
    },
    toggleTextWrap: { flex: 1, gap: 3 },
    toggleLabel: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '600',
    },
    toggleDesc: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 17,
    },
    // Space-type cards
    spaceTypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    spaceTypeCard: {
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 14,
      borderWidth: 1.5,
      flex: 1,
      gap: 3,
      minWidth: '28%',
      paddingHorizontal: 6,
      paddingVertical: 10,
    },
    spaceTypeCardActive: {
      backgroundColor: theme.primarySoft,
      borderColor: theme.primary,
    },
    spaceTypeEmoji: { fontSize: 20 },
    spaceTypeLabel: {
      color: theme.text,
      fontSize: 11,
      fontWeight: '700',
      textAlign: 'center',
    },
    spaceTypeLabelActive: { color: theme.primary },
    spaceTypeDesc: {
      color: theme.textMuted,
      fontSize: 10,
      lineHeight: 13,
      textAlign: 'center',
    },
    spaceTypeDescActive: { color: theme.primary },
    // Appearance control
    appearanceWrap: { gap: 6 },
    appearanceRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    appearanceBtn: {
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 14,
      borderWidth: 1.5,
      flex: 1,
      gap: 4,
      paddingVertical: 10,
    },
    appearanceBtnActive: {
      backgroundColor: theme.primarySoft,
      borderColor: theme.primary,
    },
    appearanceIcon: { fontSize: 18 },
    appearanceLabel: {
      color: theme.text,
      fontSize: 11,
      fontWeight: '700',
    },
    appearanceLabelActive: { color: theme.primary },
  });
