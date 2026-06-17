import { fireEvent, render } from '@testing-library/react-native';

import SavingsTracker from './SavingsTracker';

jest.mock('@expo/vector-icons', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');

  return {
    Ionicons: ({ name }: { name: string }) => <Text>{name}</Text>,
  };
});

const baseProps = {
  actionBusy: false,
  currencyCode: 'USD',
  members: [],
  onAddDeposit: jest.fn(),
  onDeleteEntry: jest.fn(),
  onWithdraw: jest.fn(),
  plans: [
    {
      created_at: '2026-05-01T00:00:00.000Z',
      created_by: 'user-1',
      end_date: '2026-05-31',
      id: 'plan-1',
      name: 'May Plan',
      profile_id: 'profile-1',
      start_date: '2026-05-01',
      total_amount: 200,
    },
  ],
  profileId: 'profile-1',
  savings: [
    {
      added_by: 'user-1',
      amount: 100,
      created_at: '2026-05-10T00:00:00.000Z',
      date: '2026-05-10',
      id: 'entry-1',
      linked_plan_id: null,
      name: 'Opening balance',
      note: null,
      profile_id: 'profile-1',
      tracker_id: 'tracker-1',
    },
  ],
  trackerId: 'tracker-1',
  userId: 'user-1',
};

describe('<SavingsTracker />', () => {
  beforeEach(() => {
    baseProps.onAddDeposit.mockReset();
    baseProps.onWithdraw.mockReset();
    baseProps.onDeleteEntry.mockReset();
  });

  it('records linked-plan deposits with the selected plan id', () => {
    const screen = render(<SavingsTracker {...baseProps} />);

    fireEvent.press(screen.getByText('Deposit'));
    fireEvent.changeText(screen.getByTestId('savings-deposit-amount-input'), '25');
    fireEvent.press(screen.getByTestId('savings-deposit-plan-plan-1'));
    fireEvent.press(screen.getByTestId('savings-deposit-confirm'));

    expect(baseProps.onAddDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 25,
        linked_plan_id: 'plan-1',
        profile_id: 'profile-1',
        tracker_id: 'tracker-1',
      }),
    );
  });

  it('blocks withdrawals that exceed the available balance', () => {
    const screen = render(<SavingsTracker {...baseProps} />);

    fireEvent.press(screen.getByText('Withdraw'));
    fireEvent.changeText(screen.getByTestId('savings-withdraw-amount-input'), '150');
    fireEvent.press(screen.getByTestId('savings-withdraw-confirm'));

    screen.getByText('Withdrawal exceeds the available savings balance.');
    expect(baseProps.onWithdraw).not.toHaveBeenCalled();
  });
});
