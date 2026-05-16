import { useState, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, View, Pressable, Modal, ScrollView, TextInput, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SavingsEntry, BudgetPlan, Member } from '../../lib/nestledger';
import { theme, rs, formatShortDate } from '../../constants/nestledger';
import BentoCard from '../ui/BentoCard';
import CategoryChip from '../ui/CategoryChip';
import ModernButton from '../ui/ModernButton';

type Props = {
  trackerId: string;
  savings: SavingsEntry[];
  plans: BudgetPlan[];
  members: Member[];
  userId: string;
  profileId: string;
  actionBusy: boolean;
  viewMonth?: number;
  viewYear?: number;
  stats?: { balance: number; deposits: number; withdrawals: number; net: number };
  onAddDeposit: (entry: Omit<SavingsEntry, 'created_at' | 'id'>) => void;
  onWithdraw: (entry: Omit<SavingsEntry, 'created_at' | 'id'>) => void;
  onDeleteEntry: (entryId: string) => void;
};

const now = new Date();
const currentMonth = now.getMonth() + 1;
const currentYear = now.getFullYear();

export default function SavingsTracker({
  trackerId,
  savings,
  plans,
  members,
  userId,
  profileId,
  actionBusy,
  viewMonth,
  viewYear,
  stats,
  onAddDeposit,
  onWithdraw,
  onDeleteEntry,
}: Props) {
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const todayStr = new Date().toISOString().slice(0, 10);
  const [depositForm, setDepositForm] = useState({ amount: '', note: '', date: todayStr, name: '' });
  const [withdrawForm, setWithdrawForm] = useState({ amount: '', note: '', planId: '', reason: 'Other' as string, date: todayStr, name: '' });
  const [selectedEntry, setSelectedEntry] = useState<SavingsEntry | null>(null);
  const [showDepositPicker, setShowDepositPicker] = useState(false);
  const [showWithdrawPicker, setShowWithdrawPicker] = useState(false);

  const trackerSavings = useMemo(() => {
    return savings.filter((e) => e.tracker_id === trackerId);
  }, [savings, trackerId]);

  const filteredSavings = useMemo(() => {
    if (viewMonth !== undefined && viewYear !== undefined) {
      return trackerSavings.filter((e) => {
        const d = new Date(e.date);
        return d.getMonth() + 1 === viewMonth && d.getFullYear() === viewYear;
      });
    }
    return trackerSavings;
  }, [trackerSavings, viewMonth, viewYear]);

  const totalSavings = useMemo(() => {
    return filteredSavings.reduce((sum, e) => sum + e.amount, 0);
  }, [filteredSavings]);

  const thisMonthEntries = useMemo(() => {
    return filteredSavings.filter((e) => {
      const d = new Date(e.date);
      return d.getFullYear() === currentYear && d.getMonth() + 1 === currentMonth;
    });
  }, [filteredSavings]);

  const thisMonthNet = useMemo(() => {
    return thisMonthEntries.reduce((sum, e) => sum + e.amount, 0);
  }, [thisMonthEntries]);

  const deposits = useMemo(() => filteredSavings.filter((e) => e.amount > 0), [filteredSavings]);
  const withdrawals = useMemo(() => filteredSavings.filter((e) => e.amount < 0), [filteredSavings]);

  const handleSubmitDeposit = () => {
    const amount = Number(depositForm.amount);
    if (!amount || amount <= 0) return;
    onAddDeposit({
      profile_id: profileId,
      amount,
      note: depositForm.note.trim() || null,
      name: depositForm.name.trim() || null,
      linked_plan_id: null,
      date: depositForm.date,
      added_by: userId,
      tracker_id: trackerId,
    });
    setShowDeposit(false);
    setDepositForm({ amount: '', note: '', date: todayStr, name: '' });
  };

  const handleSubmitWithdraw = () => {
    const amount = Number(withdrawForm.amount);
    if (!amount || amount <= 0) return;
    onWithdraw({
      profile_id: profileId,
      amount: -amount,
      name: withdrawForm.name.trim() || null,
      note: withdrawForm.note.trim() || null,
      linked_plan_id: withdrawForm.planId || null,
      date: withdrawForm.date,
      added_by: userId,
      tracker_id: trackerId,
    });
    setShowWithdraw(false);
    setWithdrawForm({ amount: '', note: '', planId: '', reason: 'Other', date: todayStr, name: '' });
  };

  const viewEntryDetail = (entry: SavingsEntry) => {
    setSelectedEntry(entry);
    setShowDetail(true);
  };

  return (
    <>
      <View style={s.headerRow}>
        <View style={s.headerContent}>
          <Text style={s.cardTitle}>Savings Tracker</Text>
          <Text style={s.bodyMuted}>
            {(stats?.balance ?? totalSavings) >= 0 ? 'Total saved' : 'Net borrowed'}: {rs(Math.abs(stats?.balance ?? totalSavings))}
          </Text>
        </View>
        <View style={s.actionButtons}>
          <ModernButton onPress={() => { setDepositForm({ amount: '', note: '', date: todayStr, name: '' }); setShowDeposit(true); }} secondary text="Deposit" />
          <ModernButton
            onPress={() => { setWithdrawForm({ amount: '', note: '', planId: '', reason: 'Other', date: todayStr, name: '' }); setShowWithdraw(true); }}
            secondary
            testID="savings-open-withdraw"
            text="Withdraw"
          />
        </View>
      </View>

      <View style={s.statRow}>
        <View style={s.statPill}>
          <Text style={s.statPillLabel}>Balance</Text>
          <Text style={[s.statPillValue, (stats?.balance ?? totalSavings) < 0 && { color: theme.danger }]}>
            {rs(stats?.balance ?? totalSavings)}
          </Text>
        </View>
        <View style={s.statPill}>
          <Text style={s.statPillLabel}>This month</Text>
          <Text style={[s.statPillValue, (stats?.net ?? thisMonthNet) < 0 ? { color: theme.danger } : { color: theme.success }]}>
            {(stats?.net ?? thisMonthNet) >= 0 ? '+' : ''}{rs(stats?.net ?? thisMonthNet)}
          </Text>
          <Text style={s.statPillSub}>{thisMonthEntries.length} entries</Text>
        </View>
        <View style={s.statPill}>
          <Text style={s.statPillLabel}>Deposits</Text>
          <Text style={s.statPillValue}>{rs(stats?.deposits ?? deposits.reduce((s, e) => s + e.amount, 0))}</Text>
          <Text style={s.statPillSub}>{stats ? '' : `${deposits.length} entries`}</Text>
        </View>
        <View style={s.statPill}>
          <Text style={s.statPillLabel}>Withdrawals</Text>
          <Text style={s.statPillValue}>{rs(stats?.withdrawals ?? Math.abs(withdrawals.reduce((s, e) => s + e.amount, 0)))}</Text>
          <Text style={s.statPillSub}>{stats ? '' : `${withdrawals.length} entries`}</Text>
        </View>
      </View>

      <View style={s.entryList}>
        {filteredSavings.length === 0 ? (
          <View style={s.emptyWrap}>
            <Ionicons color={theme.textMuted} name="wallet-outline" size={28} />
            <Text style={s.emptyText}>No savings entries yet</Text>
          </View>
        ) : (
          filteredSavings.slice(0, 10).map((entry) => (
            <Pressable key={entry.id} onPress={() => viewEntryDetail(entry)} style={s.entryRow}>
              <View style={s.entryIconWrap}>
                <Ionicons
                  color={entry.amount >= 0 ? theme.success : theme.danger}
                  name={entry.amount >= 0 ? 'add-circle' : 'remove-circle'}
                  size={22}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.entryAmount}>
                  {entry.amount >= 0 ? '+' : ''}{rs(entry.amount)}
                </Text>
                {entry.name ? (
                  <Text style={s.entryNote} numberOfLines={1}>{entry.name}</Text>
                ) : entry.note ? (
                  <Text style={s.entryNote} numberOfLines={1}>{entry.note}</Text>
                ) : null}
                <Text style={s.entryDate}>{formatShortDate(entry.date)}</Text>
              </View>
              {entry.linked_plan_id ? (
                <View style={s.planBadge}>
                  <Text style={s.planBadgeText}>
                    {plans.find((p) => p.id === entry.linked_plan_id)?.name ?? 'Plan'}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          ))
        )}
      </View>

      {filteredSavings.length > 10 ? (
        <Pressable onPress={() => viewEntryDetail(filteredSavings[0])} style={{ marginTop: 8 }}>
          <Text style={s.linkText}>View all {filteredSavings.length} entries</Text>
        </Pressable>
      ) : null}

      <Modal animationType="slide" transparent visible={showDeposit}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }}>
          <Pressable onPress={() => setShowDeposit(false)} style={s.sheetBackdrop}>
            <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', default: undefined })} style={s.sheetCard}>
            <View style={s.sheetGrabber} />
            <ScrollView contentContainerStyle={s.sheetContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
              <Pressable onPress={(e) => e.stopPropagation()}>
                <Text style={s.sectionTitle}>Add Deposit</Text>

                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>Amount (Rs.)</Text>
                  <TextInput
                    keyboardType="numeric"
                    onChangeText={(v) => setDepositForm((f) => ({ ...f, amount: v }))}
                    placeholder="e.g. 10000"
                    placeholderTextColor={theme.textMuted}
                    style={s.input}
                    testID="savings-deposit-amount-input"
                    value={depositForm.amount}
                  />
                </View>

                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>Date</Text>
                  <Pressable onPress={() => setShowDepositPicker(true)} style={s.dateButton} testID="savings-deposit-date-input">
                    <Text style={s.dateButtonText}>{formatShortDate(depositForm.date)}</Text>
                    <Ionicons color={theme.textMuted} name="calendar-outline" size={20} />
                  </Pressable>
                  {showDepositPicker ? (
                    <DateTimePicker
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      mode="date"
                      onChange={(_: any, date?: Date) => { setShowDepositPicker(false); if (date) setDepositForm((f) => ({ ...f, date: date.toISOString().slice(0, 10) })); }}
                      value={new Date(depositForm.date)}
                    />
                  ) : null}
                </View>

                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>Name (optional)</Text>
                  <TextInput
                    onChangeText={(v) => setDepositForm((f) => ({ ...f, name: v }))}
                    placeholder="e.g. Salary savings May"
                    placeholderTextColor={theme.textMuted}
                    style={s.input}
                    value={depositForm.name}
                  />
                </View>

                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>Note (optional)</Text>
                  <TextInput
                    onChangeText={(v) => setDepositForm((f) => ({ ...f, note: v }))}
                    placeholder="e.g. Monthly salary savings"
                    placeholderTextColor={theme.textMuted}
                    style={s.input}
                    testID="savings-deposit-note-input"
                    value={depositForm.note}
                  />
                </View>

                <View style={s.spacer16} />
                <ModernButton
                  loading={actionBusy}
                  onPress={handleSubmitDeposit}
                  testID="savings-deposit-confirm"
                  text="Add Deposit"
                />
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </Pressable>
        </View>
      </Modal>

      <Modal animationType="slide" transparent visible={showWithdraw}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }}>
          <Pressable onPress={() => setShowWithdraw(false)} style={s.sheetBackdrop}>
          <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', default: undefined })} style={s.sheetCard}>
            <View style={s.sheetGrabber} />
            <ScrollView contentContainerStyle={s.sheetContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
              <Pressable onPress={(e) => e.stopPropagation()}>
                <Text style={s.sectionTitle}>Withdraw</Text>

                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>Amount (Rs.)</Text>
                  <TextInput
                    keyboardType="numeric"
                    onChangeText={(v) => setWithdrawForm((f) => ({ ...f, amount: v }))}
                    placeholder="e.g. 5000"
                    placeholderTextColor={theme.textMuted}
                    style={s.input}
                    testID="savings-withdraw-amount-input"
                    value={withdrawForm.amount}
                  />
                </View>

                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>Date</Text>
                  <Pressable onPress={() => setShowWithdrawPicker(true)} style={s.dateButton} testID="savings-withdraw-date-input">
                    <Text style={s.dateButtonText}>{formatShortDate(withdrawForm.date)}</Text>
                    <Ionicons color={theme.textMuted} name="calendar-outline" size={20} />
                  </Pressable>
                  {showWithdrawPicker ? (
                    <DateTimePicker
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      mode="date"
                      onChange={(_: any, date?: Date) => { setShowWithdrawPicker(false); if (date) setWithdrawForm((f) => ({ ...f, date: date.toISOString().slice(0, 10) })); }}
                      value={new Date(withdrawForm.date)}
                    />
                  ) : null}
                </View>

                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>Name (optional)</Text>
                  <TextInput
                    onChangeText={(v) => setWithdrawForm((f) => ({ ...f, name: v }))}
                    placeholder="e.g. Home renovation"
                    placeholderTextColor={theme.textMuted}
                    style={s.input}
                    value={withdrawForm.name}
                  />
                </View>

                {plans.length > 0 ? (
                  <View style={s.fieldSection}>
                    <Text style={s.inputLabel}>Linked budget plan (optional)</Text>
                    <View style={s.segmentRow}>
                      <CategoryChip
                        active={withdrawForm.planId === ''}
                        label="Other / No plan"
                        onPress={() => setWithdrawForm((f) => ({ ...f, planId: '' }))}
                        testID="savings-withdraw-plan-none"
                      />
                      {plans.map((plan) => (
                        <CategoryChip
                          key={plan.id}
                          active={withdrawForm.planId === plan.id}
                          label={plan.name}
                          onPress={() => setWithdrawForm((f) => ({ ...f, planId: plan.id }))}
                          testID={`savings-withdraw-plan-${plan.id}`}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}

                {!withdrawForm.planId ? (
                  <View style={s.fieldSection}>
                    <Text style={s.inputLabel}>Reason</Text>
                    <View style={s.segmentRow}>
                      {['Emergency', 'Expense', 'Transfer', 'Other'].map((r) => (
                        <CategoryChip
                          key={r}
                          active={withdrawForm.reason === r}
                          label={r}
                          onPress={() => setWithdrawForm((f) => ({ ...f, reason: r }))}
                          testID={`savings-withdraw-reason-${r}`}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}

                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>Note (optional)</Text>
                  <TextInput
                    onChangeText={(v) => setWithdrawForm((f) => ({ ...f, note: v }))}
                    placeholder={
                      withdrawForm.planId
                        ? `Withdrawal for ${plans.find((p) => p.id === withdrawForm.planId)?.name ?? 'plan'}`
                        : `e.g. ${withdrawForm.reason === 'Other' ? 'Home renovation' : withdrawForm.reason}`
                    }
                    placeholderTextColor={theme.textMuted}
                    style={s.input}
                    testID="savings-withdraw-note-input"
                    value={withdrawForm.note}
                  />
                </View>

                <View style={s.spacer16} />
                <ModernButton
                  loading={actionBusy}
                  onPress={handleSubmitWithdraw}
                  destructive
                  testID="savings-withdraw-confirm"
                  text="Withdraw"
                />
                </Pressable>
              </ScrollView>
            </KeyboardAvoidingView>
          </Pressable>
          </View>
        </Modal>

      <Modal animationType="slide" presentationStyle="pageSheet" visible={showDetail}>
        <SafeWrap
          onClose={() => { setShowDetail(false); setSelectedEntry(null); }}
          title="Savings Entry"
        >
          {selectedEntry ? (
            <>
              <BentoCard tone="highlight">
                <View style={s.detailRow}>
                  <Ionicons
                    color={selectedEntry.amount >= 0 ? theme.success : theme.danger}
                    name={selectedEntry.amount >= 0 ? 'add-circle' : 'remove-circle'}
                    size={32}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={s.detailAmount}>
                      {selectedEntry.amount >= 0 ? '+' : ''}{rs(selectedEntry.amount)}
                    </Text>
                    <Text style={s.bodyMuted}>
                      {selectedEntry.amount >= 0 ? 'Deposit' : 'Withdrawal'}
                    </Text>
                  </View>
                </View>
                <View style={s.detailMeta}>
                  <Text style={s.bodyMuted}>Date: {formatShortDate(selectedEntry.date)}</Text>
                  {selectedEntry.note ? (
                    <Text style={s.bodyMuted}>Note: {selectedEntry.note}</Text>
                  ) : null}
                  {selectedEntry.linked_plan_id ? (
                    <Text style={s.bodyMuted}>
                      Plan: {plans.find((p) => p.id === selectedEntry.linked_plan_id)?.name ?? 'Unknown'}
                    </Text>
                  ) : null}
                </View>
              </BentoCard>

              <ModernButton
                destructive
                loading={actionBusy}
                onPress={() => {
                  setShowDetail(false);
                  onDeleteEntry(selectedEntry.id);
                }}
                secondary
                testID="savings-entry-delete"
                text="Delete Entry"
              />
            </>
          ) : null}
        </SafeWrap>
      </Modal>
    </>
  );
}

function SafeWrap({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <View style={s.modalScreen}>
      <View style={s.modalHeader}>
        <Pressable hitSlop={10} onPress={onClose} testID="savings-detail-close">
          <Ionicons color={theme.text} name="close-outline" size={28} />
        </Pressable>
        <Text style={s.modalTitle}>{title}</Text>
        <View />
      </View>
      <ScrollView contentContainerStyle={s.modalContent}>{children}</ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerContent: {
    flex: 1,
    gap: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    flexShrink: 0,
  },
  cardTitle: {
    color: theme.text,
    fontSize: 20,
    fontWeight: '700',
  },
  bodyMuted: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  statPill: {
    backgroundColor: theme.surfaceMuted,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flex: 1,
    minWidth: 80,
  },
  statPillLabel: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statPillValue: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
  },
  statPillSub: {
    color: theme.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  entryList: {
    marginTop: 16,
    gap: 2,
  },
  emptyWrap: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  emptyText: {
    color: theme.textMuted,
    fontSize: 14,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  entryIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryAmount: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '700',
  },
  entryNote: {
    color: theme.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  entryDate: {
    color: theme.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  planBadge: {
    backgroundColor: theme.primarySoft,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  planBadgeText: {
    color: theme.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  linkText: {
    color: theme.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: theme.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '85%',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sheetContent: {
    gap: 16,
    paddingBottom: 32,
  },
  sheetGrabber: {
    alignSelf: 'center',
    backgroundColor: theme.border,
    borderRadius: 999,
    height: 5,
    marginBottom: 14,
    width: 44,
  },
  sectionTitle: {
    color: theme.text,
    fontSize: 22,
    fontWeight: '800',
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 18,
    borderWidth: 1,
    color: theme.text,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  fieldSection: {
    gap: 10,
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  spacer16: {
    height: 16,
  },
  dateButton: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dateButtonText: {
    color: theme.text,
    fontSize: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  detailAmount: {
    color: theme.text,
    fontSize: 24,
    fontWeight: '800',
  },
  detailMeta: {
    marginTop: 12,
    gap: 4,
  },
  modalScreen: {
    backgroundColor: theme.background,
    flex: 1,
  },
  modalHeader: {
    alignItems: 'center',
    borderBottomColor: theme.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  modalTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '700',
  },
  modalContent: {
    gap: 14,
    padding: 20,
    paddingBottom: 40,
  },
});
