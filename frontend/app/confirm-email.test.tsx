import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ConfirmEmailScreen from './confirm-email';

const mockReplace = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockGetSession = jest.fn();

jest.mock('@/lib/nestledger-services', () => ({
  authApi: {
    getSession: () => mockGetSession(),
  },
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

describe('<ConfirmEmailScreen />', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockUseLocalSearchParams.mockReset();
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue(null);
  });

  it('redirects to the app when a session is already active', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } });
    mockUseLocalSearchParams.mockReturnValue({ email: 'member@example.com' });

    render(<ConfirmEmailScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
  });

  it('shows the registered email address and routes invite sign-ins back through the invite path', () => {
    mockUseLocalSearchParams.mockReturnValue({
      email: 'invitee@example.com',
      token: 'invite-token-123',
    });

    const screen = render(<ConfirmEmailScreen />);

    screen.getByText('Registration successful');
    screen.getByText('Your NestLedger account has been created.');
    screen.getByText('Confirm your email for invitee@example.com, then come back and sign in to continue.');

    fireEvent.press(screen.getByText('Back to Sign in'));

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/invite',
      params: { token: 'invite-token-123' },
    });
  });

  it('returns to the main auth route when no invite token is present', () => {
    mockUseLocalSearchParams.mockReturnValue({
      email: 'member@example.com',
    });

    const screen = render(<ConfirmEmailScreen />);

    fireEvent.press(screen.getByText('Back to Sign in'));

    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});
