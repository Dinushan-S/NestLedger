import { useState, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, View, Pressable, Modal, ScrollView, TextInput, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { BillPayment, RecurringBill, Member, BudgetPlan } from '../../lib/nestledger';
import { theme, billCategories, monthNames, formatCurrency, formatShortDate } from '../../constants/nestledger';
import BentoCard from '../ui/BentoCard';
import CategoryChip from '../ui/CategoryChip';
import ModernButton from '../ui/ModernButton';
import StatPill from '../ui/StatPill';

type Props = {
  trackerId: string;
  recurringBills: RecurringBill[];
  billPayments: BillPayment[];
  plans: BudgetPlan[];
  members: Member[];
  userId: string;
  profileId: string;
  actionBusy: boolean;
  currencyCode?: string;
  viewMonth?: number;
  viewYear?: number;
  stats?: { paid: number; paidCount: number; pending: number; pendingCount: number; totalCount: number };
  onAddBill: (bill: Omit<RecurringBill, 'created_at' | 'id'>) => void;
  onMarkPaid: (payment: Omit<BillPayment, 'created_at' | 'id'>) => void;
  onDeleteBill: (billId: string) => void;
};

type BillForm = {
  amount: string;
  category: string;
  dueDay: string;
  isActive: boolean;
  isRecurring: boolean;
  name: string;
  notifyDaysBefore: string;
  units: string;
};

const defaultBillForm = (): BillForm => ({
  amount: '',
  name: '',
  category: billCategories[0].key,
  dueDay: '1',
  notifyDaysBefore: '3',
  isRecurring: true,
  isActive: true,
  units: '',
});

const defaultPaymentForm = () => ({
  amount: '',
  units: '',
  planId: '',
  paidBy: null as string | null,
  name: '',
});

const now = new Date();
const currentMonth = now.getMonth() + 1;
const currentYear = now.getFullYear();

function getCategoryIcon(category: string): keyof typeof Ionicons.glyphMap {
  const found = billCategories.find((c) => c.key === category);
  return (found?.icon ?? 'receipt-outline') as keyof typeof Ionicons.glyphMap;
}

export function BillTracker({
  trackerId,
  recurringBills,
  billPayments,
  plans,
  members,
  userId,
  profileId,
  actionBusy,
  currencyCode: currencyCodeProp,
  viewMonth,
  viewYear,
  stats,
  onAddBill,
  onMarkPaid,
  onDeleteBill,
}: Props) {
  const currencyCode = currencyCodeProp ?? 'USD';
  const [showComposer, setShowComposer] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [selectedBill, setSelectedBill] = useState<RecurringBill | null>(null);
  const [billForm, setBillForm] = useState(defaultBillForm());
  const [paymentForm, setPaymentForm] = useState(defaultPaymentForm());
  const [showBillDetail, setShowBillDetail] = useState(false);
  const [detailBill, setDetailBill] = useState<RecurringBill | null>(null);

  const filteredBills = useMemo(() => {
    return recurringBills.filter((b) => b.tracker_id === trackerId);
  }, [recurringBills, trackerId]);

  const trackerPayments = useMemo(() => {
    return billPayments.filter((p) => p.tracker_id === trackerId);
  }, [billPayments, trackerId]);

  const filteredPayments = useMemo(() => {
    if (viewMonth !== undefined && viewYear !== undefined) {
      return trackerPayments.filter((p) => p.month === viewMonth && p.year === viewYear);
    }
    return trackerPayments;
  }, [trackerPayments, viewMonth, viewYear]);

  const thisMonthPayments = useMemo(() => {
    return filteredPayments.filter((p) => p.month === currentMonth && p.year === currentYear);
  }, [filteredPayments]);

  const paidThisMonth = useMemo(() => {
    return thisMonthPayments.filter((p) => p.status === 'paid');
  }, [thisMonthPayments]);

  const pendingThisMonth = useMemo(() => {
    return thisMonthPayments.filter((p) => p.status === 'pending');
  }, [thisMonthPayments]);

  const calculatedPaidAmount = useMemo(() => {
    return paidThisMonth.reduce((sum, p) => sum + p.amount, 0);
  }, [paidThisMonth]);

  const calculatedPendingAmount = useMemo(() => {
    return pendingThisMonth.reduce((sum, p) => sum + p.amount, 0);
  }, [pendingThisMonth]);

  const totalPaidAmount = stats?.paid ?? calculatedPaidAmount;
  const totalPendingAmount = stats?.pending ?? calculatedPendingAmount;

  const billPaymentMap = useMemo(() => {
    const map: Record<string, { paid: number; pending: number; payments: BillPayment[] }> = {};
    thisMonthPayments.forEach((p) => {
      const bid = p.bill_id ?? '__orphan';
      if (!map[bid]) map[bid] = { paid: 0, pending: 0, payments: [] };
      map[bid].payments.push(p);
      if (p.status === 'paid') map[bid].paid += 1;
      else map[bid].pending += 1;
    });
    return map;
  }, [thisMonthPayments]);

  const handleOpenComposer = () => {
    const defaultCat = billCategories[0].key;
    setBillForm({
      ...defaultBillForm(),
      name: `${defaultCat} - ${monthNames[new Date().getMonth()]} ${new Date().getFullYear()}`,
    });
    setShowComposer(true);
  };

  const handleCategoryChange = (cat: string) => {
    setBillForm((f) => ({
      ...f,
      category: cat,
      name: cat === 'Other' ? '' : `${cat} - ${monthNames[new Date().getMonth()]} ${new Date().getFullYear()}`,
    }));
  };

  const needsUnits = billForm.category === 'Electricity';

  const handleSubmitBill = () => {
    const finalName = billForm.category === 'Other' && !billForm.name.trim() ? 'Other' : billForm.name.trim();
    if (!finalName || !billForm.dueDay.trim() || !billForm.amount.trim()) return;
    onAddBill({
      profile_id: profileId,
      tracker_id: trackerId,
      name: finalName,
      category: billForm.category,
      default_amount: Number(billForm.amount),
      default_units: needsUnits && billForm.units.trim() ? Number(billForm.units) : null,
      due_day: Number(billForm.dueDay),
      notify_days_before: Number(billForm.notifyDaysBefore),
      is_recurring: billForm.isRecurring,
      is_active: billForm.isActive,
      created_by: userId,
    });
    setShowComposer(false);
    setBillForm(defaultBillForm());
  };

  const handleOpenPayment = (bill: RecurringBill) => {
    const existing = thisMonthPayments.find((p) => p.bill_id === bill.id);
    setSelectedBill(bill);
    setPaymentForm({
      amount: existing ? String(existing.amount) : bill.default_amount > 0 ? String(bill.default_amount) : '',
      units: existing?.units ? String(existing.units) : bill.default_units ? String(bill.default_units) : '',
      planId: existing?.plan_id ?? (plans.length > 0 ? plans[0].id : ''),
      paidBy: null,
      name: bill.name,
    });
    setShowPayment(true);
  };

  const handleSubmitPayment = () => {
    if (!selectedBill || !paymentForm.amount.trim()) return;
    const amount = Number(paymentForm.amount);
    if (!amount || amount <= 0) return;
    onMarkPaid({
      profile_id: profileId,
      tracker_id: trackerId,
      bill_id: selectedBill.id,
      plan_id: paymentForm.planId || null,
      amount,
      units: paymentForm.units.trim() ? Number(paymentForm.units) : null,
      name: paymentForm.name.trim() || null,
      status: 'paid',
      date: new Date().toISOString(),
      month: currentMonth,
      year: currentYear,
      added_by: paymentForm.paidBy || userId,
    });
    setShowPayment(false);
    setSelectedBill(null);
    setPaymentForm(defaultPaymentForm());
  };

  const handleViewDetail = (bill: RecurringBill) => {
    setDetailBill(bill);
    setShowBillDetail(true);
  };

  const billDetailPayments = useMemo(() => {
    if (!detailBill) return [];
    return filteredPayments
      .filter((p) => p.bill_id === detailBill.id)
      .sort((a, b) => b.year - a.year || b.month - a.month);
  }, [detailBill, filteredPayments]);

  return (
    <View>
      <View style={s.headerRow}>
        <View style={s.headerContent}>
          <Text style={s.cardTitle}>Bill Tracker</Text>
          <Text style={s.bodyMuted}>
            This month: {formatCurrency(totalPaidAmount, currencyCode ?? 'USD')} paid for {paidThisMonth.length} bills
          </Text>
        </View>
        <ModernButton onPress={handleOpenComposer} secondary testID="bill-open-composer" text="New Bill" />
      </View>

      <View style={s.statRow}>
        <StatPill label="Paid" sub={`${stats?.paidCount ?? paidThisMonth.length} bills`} value={formatCurrency(totalPaidAmount, currencyCode)} />
        <StatPill label="Pending" sub={`${stats?.pendingCount ?? pendingThisMonth.length} bills`} value={formatCurrency(totalPendingAmount, currencyCode)} valueColor={theme.warning} />
        <StatPill label="Total" sub={`${stats?.totalCount ?? thisMonthPayments.length} entries`} value={formatCurrency(totalPaidAmount + totalPendingAmount, currencyCode)} />
      </View>

      <View style={s.billList}>
        {filteredBills.length === 0 ? (
          <View style={s.emptyWrap}>
            <Ionicons color={theme.textMuted} name="receipt-outline" size={28} />
            <Text style={s.emptyText}>No recurring bills yet</Text>
          </View>
        ) : (
          filteredBills.map((bill) => {
            const stats = billPaymentMap[bill.id] ?? { paid: 0, pending: 0, payments: [] };
            return (
              <Pressable key={bill.id} onPress={() => handleViewDetail(bill)} style={s.billRow} testID={`bill-row-${bill.id}`}>
                <View style={s.billIconWrap}>
                  <Ionicons
                    color={bill.is_active ? theme.primary : theme.textMuted}
                    name={getCategoryIcon(bill.category)}
                    size={22}
                  />
                </View>
                  <View style={s.billInfo}>
                    <Text style={s.billName}>{bill.name}</Text>
                    <Text style={s.billMeta}>
                      {bill.category} &middot; Due {bill.due_day}
                      {bill.default_amount > 0 ? ` · ${formatCurrency(bill.default_amount, currencyCode)}` : ''}
                      {bill.notify_days_before > 0 ? ` · ${bill.notify_days_before}d before` : ''}
                    </Text>
                  </View>
                <View style={s.billActions}>
                  <Text style={s.billCount}>
                    {stats.paid > 0 ? (
                      <Text style={{ color: theme.success }}>{stats.paid} paid</Text>
                    ) : null}
                    {stats.paid > 0 && stats.pending > 0 ? ' / ' : null}
                    {stats.pending > 0 ? (
                      <Text style={{ color: theme.warning }}>{stats.pending} pending</Text>
                    ) : null}
                    {stats.paid === 0 && stats.pending === 0 ? 'No entries' : null}
                  </Text>
                  <Pressable
                    hitSlop={10}
                    onPress={() => handleOpenPayment(bill)}
                    style={s.payButton}
                    testID={`bill-mark-paid-${bill.id}`}
                  >
                    <Ionicons color={theme.primary} name="checkmark-circle-outline" size={22} />
                  </Pressable>
                </View>
              </Pressable>
            );
          })
        )}
      </View>

      <Modal animationType="slide" transparent visible={showComposer}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }}>
          <Pressable onPress={() => setShowComposer(false)} style={s.sheetBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.select({ ios: 'padding', default: undefined })}
            style={s.sheetCard}
          >
            <View style={s.sheetGrabber} />
            <ScrollView
              contentContainerStyle={s.sheetContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Pressable onPress={(e) => e.stopPropagation()}>
                <Text style={s.sectionTitle}>New Bill</Text>

                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>Amount ({currencyCode})</Text>
                  <TextInput
                    keyboardType="numeric"
                    onChangeText={(v) => setBillForm((f) => ({ ...f, amount: v }))}
                    placeholder="e.g. 2500"
                    placeholderTextColor={theme.textMuted}
                    style={s.input}
                    testID="bill-amount-input"
                    value={billForm.amount}
                  />
                </View>

                <View style={s.fieldSection}>
                  <Text style={s.inputLabel}>Category</Text>
                  <View style={s.segmentRow}>
                    {billCategories.map((cat) => (
                      <CategoryChip
                        key={cat.key}
                        active={billForm.category === cat.key}
                        label={cat.key}
                        onPress={() => handleCategoryChange(cat.key)}
                        testID={`bill-category-${cat.key}`}
                      />
                    ))}
                  </View>
                </View>

                {billForm.category === 'Other' ? (
                  <View style={s.inputGroup}>
                    <Text style={s.inputLabel}>Custom bill name</Text>
                    <TextInput
                      onChangeText={(v) => setBillForm((f) => ({ ...f, name: v }))}
                      placeholder="e.g. Groceries, Maintenance..."
                      placeholderTextColor={theme.textMuted}
                      style={s.input}
                      testID="bill-custom-name-input"
                      value={billForm.name}
                    />
                  </View>
                ) : (
                  <Text style={s.bodyMuted}>{billForm.name}</Text>
                )}

                {needsUnits ? (
                  <View style={s.inputGroup}>
                    <Text style={s.inputLabel}>Units (kWh)</Text>
                    <TextInput
                      keyboardType="numeric"
                      onChangeText={(v) => setBillForm((f) => ({ ...f, units: v }))}
                      placeholder="e.g. 500"
                      placeholderTextColor={theme.textMuted}
                      style={s.input}
                      testID="bill-units-input"
                      value={billForm.units}
                    />
                  </View>
                ) : null}

                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>Due day of month</Text>
                  <TextInput
                    keyboardType="numeric"
                    onChangeText={(v) => setBillForm((f) => ({ ...f, dueDay: v }))}
                    placeholder="e.g. 15"
                    placeholderTextColor={theme.textMuted}
                    style={s.input}
                    testID="bill-due-day-input"
                    value={billForm.dueDay}
                  />
                </View>

                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>Notify days before due</Text>
                  <TextInput
                    keyboardType="numeric"
                    onChangeText={(v) => setBillForm((f) => ({ ...f, notifyDaysBefore: v }))}
                    placeholder="e.g. 3"
                    placeholderTextColor={theme.textMuted}
                    style={s.input}
                    testID="bill-notify-days-input"
                    value={billForm.notifyDaysBefore}
                  />
                </View>

                <View style={s.toggleRow}>
                  <Text style={s.inputLabel}>Recurring</Text>
                  <Pressable
                    hitSlop={10}
                    onPress={() => setBillForm((f) => ({ ...f, isRecurring: !f.isRecurring }))}
                    style={[s.toggleTrack, billForm.isRecurring && s.toggleTrackActive]}
                    testID="bill-recurring-toggle"
                  >
                    <View style={[s.toggleThumb, billForm.isRecurring && s.toggleThumbActive]} />
                  </Pressable>
                </View>

                <View style={s.toggleRow}>
                  <Text style={s.inputLabel}>Active</Text>
                  <Pressable
                    hitSlop={10}
                    onPress={() => setBillForm((f) => ({ ...f, isActive: !f.isActive }))}
                    style={[s.toggleTrack, billForm.isActive && s.toggleTrackActive]}
                    testID="bill-active-toggle"
                  >
                    <View style={[s.toggleThumb, billForm.isActive && s.toggleThumbActive]} />
                  </Pressable>
                </View>

                <View style={s.spacer16} />
                <ModernButton
                  loading={actionBusy}
                  onPress={handleSubmitBill}
                  testID="bill-save-button"
                  text="Save Bill"
                />
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </Pressable>
        </View>
      </Modal>

      <Modal animationType="slide" transparent visible={showPayment}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }}>
          <Pressable onPress={() => { setShowPayment(false); setSelectedBill(null); }} style={s.sheetBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.select({ ios: 'padding', default: undefined })}
            style={s.sheetCard}
          >
            <View style={s.sheetGrabber} />
            <ScrollView
              contentContainerStyle={s.sheetContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Pressable onPress={(e) => e.stopPropagation()}>
                <Text style={s.sectionTitle}>
                  {selectedBill ? `Pay ${selectedBill.name}` : 'Mark as Paid'}
                </Text>

                {selectedBill ? (
                  <View style={s.paymentInfoRow}>
                    <View style={s.billIconWrap}>
                      <Ionicons
                        color={theme.primary}
                        name={getCategoryIcon(selectedBill.category)}
                        size={22}
                      />
                    </View>
                    <View>
                      <Text style={s.billName}>{selectedBill.name}</Text>
                      <Text style={s.billMeta}>
                        {selectedBill.category} &middot; Due day {selectedBill.due_day}
                      </Text>
                    </View>
                  </View>
                ) : null}

                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>Amount ({currencyCode})</Text>
                  <TextInput
                    keyboardType="numeric"
                    onChangeText={(v) => setPaymentForm((f) => ({ ...f, amount: v }))}
                    placeholder="e.g. 2500"
                    placeholderTextColor={theme.textMuted}
                    style={s.input}
                    testID="bill-payment-amount-input"
                    value={paymentForm.amount}
                  />
                </View>

                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>Name / Description (optional)</Text>
                  <TextInput
                    onChangeText={(v) => setPaymentForm((f) => ({ ...f, name: v }))}
                    placeholder="e.g. May Electricity Bill"
                    placeholderTextColor={theme.textMuted}
                    style={s.input}
                    value={paymentForm.name}
                  />
                </View>

                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>Units (optional)</Text>
                  <TextInput
                    keyboardType="numeric"
                    onChangeText={(v) => setPaymentForm((f) => ({ ...f, units: v }))}
                    placeholder="e.g. 150 kWh"
                    placeholderTextColor={theme.textMuted}
                    style={s.input}
                    testID="bill-payment-units-input"
                    value={paymentForm.units}
                  />
                </View>

                {plans.length > 0 ? (
                  <View style={s.fieldSection}>
                    <Text style={s.inputLabel}>Budget plan</Text>
                    <View style={s.segmentRow}>
                      {plans.map((plan) => (
                        <CategoryChip
                          key={plan.id}
                          active={paymentForm.planId === plan.id}
                          label={plan.name}
                          onPress={() => setPaymentForm((f) => ({ ...f, planId: plan.id }))}
                          testID={`bill-payment-plan-${plan.id}`}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}

                <View style={s.fieldSection}>
                  <Text style={s.inputLabel}>Who paid?</Text>
                  <View style={s.segmentRow}>
                    <CategoryChip
                      active={paymentForm.paidBy === null}
                      label="Family Budget"
                      onPress={() => setPaymentForm((f) => ({ ...f, paidBy: null }))}
                      testID="bill-payment-paid-by-family"
                    />
                    {members.map((m) => (
                      <CategoryChip
                        key={m.user_id}
                        active={paymentForm.paidBy === m.user_id}
                        label={`${m.user_profile?.avatar_emoji ?? '👤'} ${m.user_profile?.name ?? 'Unknown'}`}
                        onPress={() => setPaymentForm((f) => ({ ...f, paidBy: m.user_id }))}
                        testID={`bill-payment-paid-by-${m.user_id}`}
                      />
                    ))}
                  </View>
                </View>

                <View style={s.spacer16} />
                <ModernButton
                  loading={actionBusy}
                  onPress={handleSubmitPayment}
                  testID="bill-payment-confirm"
                  text="Mark as Paid"
                />
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </Pressable>
        </View>
      </Modal>

      <Modal animationType="slide" presentationStyle="pageSheet" visible={showBillDetail}>
        <SafeWrap onClose={() => { setShowBillDetail(false); setDetailBill(null); }} title={detailBill?.name ?? 'Bill Details'}>
          {detailBill ? (
            <>
              <BentoCard>
                <View style={s.detailHeader}>
                  <View style={s.billIconWrap}>
                    <Ionicons color={theme.primary} name={getCategoryIcon(detailBill.category)} size={28} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.detailName}>{detailBill.name}</Text>
                    <Text style={s.bodyMuted}>
                      {detailBill.category} &middot; Due day {detailBill.due_day}
                    </Text>
                    <Text style={s.bodyMuted}>
                      {detailBill.is_recurring ? 'Recurring' : 'One-time'} &middot;{' '}
                      {detailBill.is_active ? 'Active' : 'Inactive'}
                    </Text>
                    <Text style={s.bodyMuted}>
                      Notify {detailBill.notify_days_before} day(s) before
                    </Text>
                  </View>
                </View>
              </BentoCard>

              <View style={s.actionRow}>
                <ModernButton
                  onPress={() => { setShowBillDetail(false); handleOpenPayment(detailBill); }}
                  testID="bill-detail-mark-paid"
                  text="Mark as Paid"
                />
                <ModernButton
                  destructive
                  onPress={() => {
                    setShowBillDetail(false);
                    onDeleteBill(detailBill.id);
                  }}
                  secondary
                  testID="bill-detail-delete"
                  text="Delete"
                />
              </View>

              <Text style={s.inputLabel}>Payment History</Text>
              {billDetailPayments.length === 0 ? (
                <View style={s.emptyWrap}>
                  <Text style={s.emptyText}>No payments recorded yet</Text>
                </View>
              ) : (
                billDetailPayments.map((p) => (
                  <BentoCard key={p.id}>
                    <View style={s.paymentHistoryRow}>
                      <Ionicons
                        color={p.status === 'paid' ? theme.success : theme.warning}
                        name={p.status === 'paid' ? 'checkmark-circle' : 'time-outline'}
                        size={22}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={s.listTitle}>
                          {formatCurrency(p.amount, currencyCode)}
                          {p.units ? ` (${p.units} units)` : ''}
                        </Text>
                        <Text style={s.listSubtitle}>
                          {p.status === 'paid' ? 'Paid' : 'Pending'} &middot;{' '}
                          {monthNames[p.month - 1]} {p.year}
                          {p.date ? ` · ${formatShortDate(p.date)}` : ''}
                        </Text>
                        {p.plan_id ? (
                          <Text style={s.listSubtitle}>
                            Plan: {plans.find((pl) => pl.id === p.plan_id)?.name ?? 'Unknown'}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </BentoCard>
                ))
              )}
            </>
          ) : null}
        </SafeWrap>
      </Modal>
    </View>
  );
}

function SafeWrap({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <View style={s.modalScreen}>
      <View style={s.modalHeader}>
        <Pressable hitSlop={10} onPress={onClose} testID="bill-detail-close">
          <Ionicons color={theme.text} name="close-outline" size={28} />
        </Pressable>
        <Text style={s.modalTitle}>{title}</Text>
        <View />
      </View>
      <ScrollView contentContainerStyle={s.modalContent} showsVerticalScrollIndicator={false}>{children}</ScrollView>
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
  billList: {
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
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  billIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  billInfo: {
    flex: 1,
  },
  billName: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '700',
  },
  billMeta: {
    color: theme.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  billActions: {
    alignItems: 'flex-end',
    gap: 6,
  },
  billCount: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  payButton: {
    padding: 4,
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
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  toggleTrack: {
    width: 52,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.border,
    padding: 2,
    justifyContent: 'center',
  },
  toggleTrackActive: {
    backgroundColor: theme.primary,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  spacer16: {
    height: 16,
  },
  paymentInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.primarySoft,
    borderRadius: 18,
    padding: 14,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  detailName: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  paymentHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  listTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '700',
  },
  listSubtitle: {
    color: theme.textMuted,
    fontSize: 13,
    marginTop: 2,
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

export default BillTracker;
