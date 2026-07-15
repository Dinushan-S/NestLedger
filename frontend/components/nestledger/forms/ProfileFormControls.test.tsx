import { render } from '@testing-library/react-native';

import { ProfileFormFields, SettingsSummaryField } from './ProfileFormControls';

jest.mock('@expo/vector-icons', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');

  return {
    Ionicons: ({ name }: { name: string }) => <Text>{name}</Text>,
  };
});

const profileForm = {
  avatarEmoji: '🏡',
  currency: 'LKR',
  familyEmoji: '🪴',
  familyName: 'Home',
  name: 'Selva',
  spaceType: 'family',
};

describe('<ProfileFormFields />', () => {
  it('supports a compact currency summary field instead of rendering the old inline currency grid', () => {
    const screen = render(
      <ProfileFormFields
        currencyField={
          <SettingsSummaryField
            onPress={jest.fn()}
            testID="settings-open-currency-selector"
            title="Currency"
            value="LKR (Rs.)"
          />
        }
        form={profileForm}
        onChange={jest.fn()}
        userOnly
      />,
    );

    screen.getByTestId('settings-open-currency-selector');
    screen.getByText('LKR (Rs.)');
    expect(screen.queryByTestId('currency-chip-USD')).toBeNull();
  });
});
