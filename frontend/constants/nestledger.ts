export const theme = {
  background: '#F6F5F2',
  surface: '#FFFFFF',
  surfaceMuted: '#F9F9F8',
  primary: '#5D7B6F',
  primarySoft: '#E5EFE9',
  secondary: '#D99F89',
  secondarySoft: '#F5E3DD',
  text: '#2D312F',
  textMuted: '#6E7370',
  border: '#E5E5E0',
  success: '#8AB096',
  danger: '#D67C7C',
  dangerSoft: '#F5E0E0',
  warning: '#E1B45C',
};

export const avatarChoices = ['🏡', '🪴', '🧺', '☕', '🧡', '🌿', '✨', '🐣'];

export const shoppingCategories = [
  'Groceries',
  'Household',
  'Personal Care',
  'Kitchen',
  'Electronics',
  'Stationery',
  'Other',
];

export const expenseCategories = [
  { key: 'Food & Dining', icon: 'restaurant-outline' },
  { key: 'Transport', icon: 'car-outline' },
  { key: 'Housing & Rent', icon: 'home-outline' },
  { key: 'Utilities', icon: 'flash-outline' },
  { key: 'Groceries', icon: 'basket-outline' },
  { key: 'Clothing', icon: 'shirt-outline' },
  { key: 'Healthcare', icon: 'medkit-outline' },
  { key: 'Education', icon: 'school-outline' },
  { key: 'Entertainment', icon: 'game-controller-outline' },
  { key: 'Other', icon: 'wallet-outline' },
];

export const shoppingFilters = ['All', 'Pending', 'Bought'] as const;
export const expenseFilters = ['Day', 'Week', 'Month'] as const;

export const rs = (value: number) =>
  `Rs. ${new Intl.NumberFormat('en-LK', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0)}`;

export const formatShortDate = (value?: string | null) => {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleDateString('en-LK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

export const startOfWeek = () => {
  const date = startOfToday();
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
};

export const startOfMonth = () => {
  const date = startOfToday();
  date.setDate(1);
  return date;
};