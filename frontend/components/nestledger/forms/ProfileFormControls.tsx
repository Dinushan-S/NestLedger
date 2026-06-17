import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';

import { avatarChoices, currencyOptions, theme } from '@/constants/nestledger';

export type CreateProfileForm = {
  avatarEmoji: string;
  currency: string;
  familyEmoji: string;
  familyName: string;
  name: string;
  spaceType: string;
};

type ProfileFormFieldsProps = {
  currencyField?: ReactNode;
  form: CreateProfileForm;
  onChange: (value: CreateProfileForm) => void;
  testIDPrefix?: string;
  userOnly?: boolean;
};

export function LabeledInput({ label, ...props }: { label: string } & TextInputProps) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput placeholderTextColor={theme.textMuted} style={styles.input} {...props} />
    </View>
  );
}

export function AvatarPicker({
  onPick,
  selected,
  testIDPrefix,
}: {
  onPick: (value: string) => void;
  selected: string;
  testIDPrefix?: string;
}) {
  return (
    <View style={styles.avatarGrid}>
      {avatarChoices.map((choice) => (
        <Pressable
          key={choice}
          onPress={() => onPick(choice)}
          style={[styles.avatarChoice, selected === choice && styles.avatarChoiceActive]}
          testID={testIDPrefix ? `${testIDPrefix}-${choice}` : undefined}
        >
          <Text style={styles.avatarChoiceText}>{choice}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function ProfileFormFields({
  currencyField,
  form,
  onChange,
  testIDPrefix,
  userOnly,
}: ProfileFormFieldsProps) {
  const prefix = testIDPrefix ?? (userOnly ? 'settings' : 'create-profile');

  return (
    <>
      <LabeledInput
        label="Your name"
        onChangeText={(value: string) => onChange({ ...form, name: value })}
        testID={`${prefix}-name-input`}
        value={form.name}
      />
      <Text style={styles.inputLabel}>Choose your avatar</Text>
      <AvatarPicker
        selected={form.avatarEmoji}
        testIDPrefix={`${prefix}-avatar`}
        onPick={(value) => onChange({ ...form, avatarEmoji: value })}
      />
      <Text style={styles.inputLabel}>Your currency</Text>
      {currencyField ?? (
        <CurrencyPicker
          value={form.currency}
          onChange={(value) => onChange({ ...form, currency: value })}
        />
      )}

      {!userOnly ? (
        <>
          <LabeledInput
            label="Space name"
            onChangeText={(value: string) => onChange({ ...form, familyName: value })}
            testID={`${prefix}-family-name-input`}
            value={form.familyName}
          />
          <Text style={styles.inputLabel}>Space avatar</Text>
          <AvatarPicker
            selected={form.familyEmoji}
            testIDPrefix={`${prefix}-family-avatar`}
            onPick={(value) => onChange({ ...form, familyEmoji: value })}
          />
        </>
      ) : null}
    </>
  );
}

function CurrencyPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.currencyGrid}>
      {currencyOptions.map((option) => {
        const active = value === option.code;

        return (
          <Pressable
            key={option.code}
            onPress={() => onChange(option.code)}
            style={[styles.currencyChip, active && styles.currencyChipActive]}
            testID={`currency-chip-${option.code}`}
          >
            <Text style={[styles.currencyChipCode, active && styles.currencyChipCodeActive]}>
              {option.code}
            </Text>
            <Text
              style={[styles.currencyChipSymbol, active && styles.currencyChipSymbolActive]}
            >
              {option.symbol}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SettingsSummaryField({
  description,
  icon,
  onPress,
  testID,
  title,
  value,
}: {
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  testID?: string;
  title: string;
  value: string;
}) {
  return (
    <Pressable onPress={onPress} style={styles.settingsField} testID={testID}>
      <View style={styles.settingsFieldCopy}>
        <Text style={styles.settingsFieldTitle}>{title}</Text>
        <Text style={styles.settingsFieldValue}>{value}</Text>
        {description ? <Text style={styles.settingsFieldDescription}>{description}</Text> : null}
      </View>
      <Ionicons
        color={theme.textMuted}
        name={icon ?? 'chevron-forward-outline'}
        size={20}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatarChoice: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  avatarChoiceActive: {
    backgroundColor: theme.primarySoft,
    borderColor: theme.primary,
  },
  avatarChoiceText: {
    fontSize: 24,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  currencyChip: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  currencyChipActive: {
    backgroundColor: theme.primarySoft,
    borderColor: theme.primary,
  },
  currencyChipCode: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '600',
  },
  currencyChipCodeActive: {
    color: theme.primary,
  },
  currencyChipSymbol: {
    color: theme.textMuted,
    fontSize: 12,
  },
  currencyChipSymbolActive: {
    color: theme.primary,
  },
  currencyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  input: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 16,
    borderWidth: 1,
    color: theme.text,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '600',
  },
  settingsField: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  settingsFieldCopy: {
    flex: 1,
    gap: 2,
  },
  settingsFieldDescription: {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  settingsFieldTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '700',
  },
  settingsFieldValue: {
    color: theme.primary,
    fontSize: 15,
    fontWeight: '600',
  },
});
