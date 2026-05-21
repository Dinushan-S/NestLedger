import { ReactNode, useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { CURRENCY_INFO, theme } from '@/constants/nestledger';

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
  deletingProfile: boolean;
  onChange: (value: CreateProfileForm) => void;
  onClose: () => void;
  onDeleteSpace: () => void;
  onSave: () => void;
  onSignOut: () => void;
  profileForm: CreateProfileForm;
  visible: boolean;
};

const settingsSections: SettingsSectionItem[] = [
  { key: 'personal', title: 'Personal profile', description: 'Your name, avatar, and default currency.' },
  { key: 'household', title: 'Household profile', description: 'Shared name and avatar for this space.' },
  { key: 'preferences', title: 'Preferences', description: 'Compact settings controls that avoid noisy full-list editing.' },
  { key: 'danger', title: 'Danger zone', description: 'Account and destructive actions live here.' },
];

export function ProfileSettingsModal({
  actionBusy,
  deletingProfile,
  onChange,
  onClose,
  onDeleteSpace,
  onSave,
  onSignOut,
  profileForm,
  visible,
}: ProfileSettingsModalProps) {
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
          </SettingsSection>

          <SettingsSection item={settingsSections[2]}>
            <Text style={styles.preferenceHint}>
              Amount formatting updates everywhere after you save, while keeping all existing budget and tracker logic the same.
            </Text>
          </SettingsSection>

          <SettingsSection item={settingsSections[3]}>
            <View style={styles.actionStack}>
              <ModernButton loading={actionBusy} onPress={onSave} testID="settings-save-button" text="Save changes" />
              <ModernButton onPress={onSignOut} secondary testID="settings-signout-button" text="Sign out" />
              <ModernButton destructive loading={deletingProfile} onPress={onDeleteSpace} secondary testID="settings-delete-button" text="Delete space" />
            </View>
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

function SettingsSection({
  children,
  item,
}: {
  children: ReactNode;
  item: SettingsSectionItem;
}) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{item.title}</Text>
      {item.description ? <Text style={styles.sectionDescription}>{item.description}</Text> : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionStack: {
    gap: 10,
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
  sectionBody: {
    gap: 14,
  },
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
});
