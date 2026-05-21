import { fireEvent, render } from '@testing-library/react-native';

import { CurrencySelectorSheet } from './CurrencySelectorSheet';

describe('<CurrencySelectorSheet />', () => {
  it('shows the current currency summary and lets the user search then pick a different currency', () => {
    const onChange = jest.fn();
    const onClose = jest.fn();
    const screen = render(
      <CurrencySelectorSheet
        onChange={onChange}
        onClose={onClose}
        popularCodes={['USD', 'EUR', 'GBP']}
        value="LKR"
        visible
      />,
    );

    screen.getByText('Current selection');
    screen.getByText('LKR');
    const searchInput = screen.getByPlaceholderText('Search currencies');

    fireEvent.changeText(searchInput, 'yen');

    screen.getByText('JPY');
    fireEvent.press(screen.getByTestId('currency-option-JPY'));

    expect(onChange).toHaveBeenCalledWith('JPY');
  });
});
