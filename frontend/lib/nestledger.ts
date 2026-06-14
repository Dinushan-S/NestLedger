import { Session, User } from '@supabase/supabase-js';

import { appConfig } from './config';
import { supabase } from './supabase';

export type UserProfile = {
  avatar_emoji: string | null;
  created_at: string;
  email: string;
  name: string;
  currency: string;
  updated_at: string;
  user_id: string;
};

export type SpaceType = 'personal' | 'family' | 'trip_family' | 'trip_friends' | 'shared_living';

export type HouseholdProfile = {
  created_at: string;
  created_by: string;
  emoji_avatar: string | null;
  id: string;
  name: string;
  space_type: SpaceType;
  bill_tracker_enabled: boolean;
  savings_tracker_enabled: boolean;
};

export type BudgetPlan = {
  created_at: string;
  created_by: string;
  end_date: string;
  id: string;
  name: string;
  profile_id: string;
  start_date: string;
  total_amount: number;
};

export type Expense = {
  added_by: string;
  category: string;
  created_at: string;
  date: string;
  description: string | null;
  id: string;
  is_borrow: boolean;
  paid_by: string | null;
  plan_id: string;
  price: number;
  profile_id: string;
  used_by: string | null;
};

export type ExpenseItem = {
  created_at: string;
  expense_id: string;
  id: string;
  name: string;
  price: number;
};

export type ExpenseWithItems = Expense & {
  items: ExpenseItem[];
};

export type ShoppingItem = {
  added_by: string;
  bought_at: string | null;
  bought_by: string | null;
  category: string | null;
  created_at: string;
  id: string;
  is_bought: boolean;
  linked_expense_id?: string | null;
  name: string;
  profile_id: string;
  quantity: string | null;
};

export type Member = {
  id: string;
  joined_at: string;
  profile_id: string;
  user_id: string;
  user_profile: UserProfile | null;
};

export type AppNotification = {
  created_at: string;
  id: string;
  is_read: boolean;
  message: string;
  profile_id: string;
  type: string;
  user_id: string;
};

export type RecurringBill = {
  id: string;
  profile_id: string;
  tracker_id: string;
  name: string;
  category: string;
  default_amount: number;
  default_units: number | null;
  due_day: number;
  notify_days_before: number;
  is_recurring: boolean;
  is_active: boolean;
  created_by: string;
  created_at: string;
};

export type BillPayment = {
  id: string;
  profile_id: string;
  tracker_id: string;
  bill_id: string | null;
  plan_id: string | null;
  amount: number;
  units: number | null;
  name: string | null;
  status: 'pending' | 'paid';
  date: string | null;
  month: number;
  year: number;
  added_by: string;
  created_at: string;
};

type BillPaymentInsert = Omit<BillPayment, 'created_at' | 'id' | 'name'>;

const billPaymentColumns = 'id, profile_id, tracker_id, bill_id, plan_id, amount, units, status, date, month, year, added_by, created_at';

export type SavingsEntry = {
  id: string;
  profile_id: string;
  tracker_id: string;
  amount: number;
  note: string | null;
  name: string | null;
  linked_plan_id: string | null;
  date: string;
  added_by: string;
  created_at: string;
};

export type BillTrackerMeta = {
  id: string;
  profile_id: string;
  name: string;
  created_by: string;
  created_at: string;
};

export type SavingsTrackerMeta = {
  id: string;
  profile_id: string;
  name: string;
  created_by: string;
  created_at: string;
};

type AuthPayload = {
  email: string;
  password: string;
};

type CreateHouseholdPayload = {
  avatarEmoji: string;
  currency?: string;
  familyEmoji: string;
  familyName: string;
  name: string;
  spaceType: SpaceType;
  user: User;
};

type InvitePayload = {
  invited_email: string;
  inviter_name: string;
  profile_id: string;
  profile_name: string;
};

const nowIso = () => new Date().toISOString();

const backendUrl = `${appConfig.backendUrl}/api`;

const requireValue = <T,>(value: T | null, message: string) => {
  if (!value) {
    throw new Error(message);
  }

  return value;
};

const callBackend = async <T,>(path: string, accessToken: string, body?: Record<string, unknown>) => {
  const response = await fetch(`${backendUrl}${path}`, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    method: body ? 'POST' : 'GET',
  });

  const json = await response.json();

  if (!response.ok) {
    throw new Error(json.detail ?? 'Backend request failed');
  }

  return json as T;
};

export const authApi = {
  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  },
  async signIn(payload: AuthPayload) {
    const { data, error } = await supabase.auth.signInWithPassword(payload);
    if (error) throw error;
    return data.session;
  },
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
  async signUp(payload: AuthPayload) {
    const { data, error } = await supabase.auth.signUp(payload);
    if (error) throw error;
    return data;
  },
};

export const profileApi = {
  async fetchUserProfile(userId: string) {
    const { data, error } = await supabase.from('user_profiles').select('*').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data as UserProfile | null;
  },
  async upsertUserProfile(user: User, values: { avatarEmoji: string; name: string; currency?: string }) {
    const payload: Record<string, string> = {
      avatar_emoji: values.avatarEmoji,
      created_at: nowIso(),
      email: user.email ?? '',
      name: values.name.trim(),
      updated_at: nowIso(),
      user_id: user.id,
    };
    if (values.currency) {
      payload.currency = values.currency;
    }

    const { data, error } = await supabase.from('user_profiles').upsert(payload).select('*').single();
    if (error) throw error;
    return data as UserProfile;
  },
  async createHousehold(payload: CreateHouseholdPayload) {
    await this.upsertUserProfile(payload.user, {
      avatarEmoji: payload.avatarEmoji,
      currency: payload.currency,
      name: payload.name,
    });

    const profileInsert = {
      created_at: nowIso(),
      created_by: payload.user.id,
      emoji_avatar: payload.familyEmoji,
      name: payload.familyName.trim(),
      space_type: payload.spaceType,
    };

    const { data: profile, error: profileError } = await supabase.from('profiles').insert(profileInsert).select('*').single();
    if (profileError) throw profileError;

    const membershipInsert = {
      joined_at: nowIso(),
      profile_id: profile.id,
      user_id: payload.user.id,
    };

    const { error: memberError } = await supabase.from('profile_members').insert(membershipInsert);
    if (memberError) throw memberError;

    return profile as HouseholdProfile;
  },
  async fetchAccessibleProfiles(userId: string) {
    const { data: memberships, error } = await supabase
      .from('profile_members')
      .select('joined_at, profile:profiles(*)')
      .eq('user_id', userId)
      .order('joined_at', { ascending: false });

    if (error) throw error;
    return (((memberships ?? []).map((item) => item.profile).filter(Boolean) as unknown) as HouseholdProfile[]) ?? [];
  },
  async fetchMembers(profileId: string) {
    const { data: memberships, error } = await supabase
      .from('profile_members')
      .select('*')
      .eq('profile_id', profileId)
      .order('joined_at', { ascending: true });

    if (error) throw error;

    const userIds = [...new Set((memberships ?? []).map((item) => item.user_id))];
    const { data: userProfiles, error: profilesError } = await supabase
      .from('user_profiles')
      .select('*')
      .in('user_id', userIds.length ? userIds : ['']);

    if (profilesError) throw profilesError;

    const profileMap = new Map((userProfiles ?? []).map((item) => [item.user_id, item]));

    return (memberships ?? []).map((item) => ({
      ...item,
      user_profile: profileMap.get(item.user_id) ?? null,
    })) as Member[];
  },
  async fetchProfile(profileId: string) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', profileId).single();
    if (error) throw error;
    return data as HouseholdProfile;
  },
  async updateHousehold(profileId: string, values: Partial<Pick<HouseholdProfile, 'bill_tracker_enabled' | 'emoji_avatar' | 'name' | 'savings_tracker_enabled' | 'space_type'>>) {
    const { data, error } = await supabase
      .from('profiles')
      .update(values)
      .eq('id', profileId)
      .select('*')
      .single();

    if (error) throw error;
    return data as HouseholdProfile;
  },
  async deleteHousehold(session: Session, profileId: string) {
    return callBackend('/spaces/delete', session.access_token, { profile_id: profileId });
  },
};

export const budgetApi = {
  async createPlan(input: Omit<BudgetPlan, 'created_at' | 'id'>) {
    const payload = { ...input, created_at: nowIso() };
    const { data, error } = await supabase.from('budget_plans').insert(payload).select('*').single();
    if (error) throw error;
    return data as BudgetPlan;
  },
  async updatePlan(planId: string, updates: Partial<Pick<BudgetPlan, 'end_date' | 'name' | 'start_date' | 'total_amount'>>) {
    const { data, error } = await supabase.from('budget_plans').update(updates).eq('id', planId).select('*').single();
    if (error) throw error;
    return data as BudgetPlan;
  },
  async deletePlan(planId: string) {
    const { data, error } = await supabase.from('budget_plans').delete().eq('id', planId).select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('Unable to delete budget plan. You may not have permission.');
    }
  },
  async fetchPlans(profileId: string) {
    const { data, error } = await supabase
      .from('budget_plans')
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as BudgetPlan[];
  },
};

export const expenseApi = {
  async addExpense(
    input: Omit<Expense, 'created_at' | 'id' | 'price'> & { items: Omit<ExpenseItem, 'created_at' | 'expense_id' | 'id'>[] }
  ) {
    const totalPrice = input.items.reduce((sum, item) => sum + item.price, 0);
    const { items, description, ...expenseData } = input;
    
    // Build expense payload - only include description if it has a value
    const expensePayload: any = { 
      ...expenseData, 
      price: totalPrice, 
      created_at: nowIso() 
    };
    
    // Only add description if it's not null/empty
    if (description && description.trim()) {
      expensePayload.description = description.trim();
    }
    
    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .insert(expensePayload)
      .select('*')
      .single();
    
    if (expenseError) throw expenseError;

    if (items.length > 0) {
      const itemsPayload = items.map(item => ({
        ...item,
        expense_id: expense.id,
        created_at: nowIso(),
      }));
      
      const { error: itemsError } = await supabase
        .from('expense_items')
        .insert(itemsPayload);
      
      if (itemsError) throw itemsError;
    }

    return { ...expense, items } as ExpenseWithItems;
  },
  async addExpenseWithId(
    input: Omit<Expense, 'created_at' | 'id' | 'price'> & { items: Omit<ExpenseItem, 'created_at' | 'expense_id' | 'id'>[] }
  ): Promise<{ id: string }> {
    const totalPrice = input.items.reduce((sum, item) => sum + item.price, 0);
    const { items, description, ...expenseData } = input;
    
    const expensePayload: any = { 
      ...expenseData, 
      price: totalPrice, 
      created_at: nowIso() 
    };
    
    if (description && description.trim()) {
      expensePayload.description = description.trim();
    }
    
    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .insert(expensePayload)
      .select('id')
      .single();
    
    if (expenseError) throw expenseError;
    
    if (items.length > 0) {
      const itemsPayload = items.map(item => ({
        ...item,
        expense_id: expense.id,
        created_at: nowIso(),
      }));
      
      const { error: itemsError } = await supabase
        .from('expense_items')
        .insert(itemsPayload);
      
      if (itemsError) throw itemsError;
    }

    return { id: expense.id };
  },
  async updateExpense(
    expenseId: string, 
    updates: Partial<Pick<Expense, 'category' | 'date' | 'description' | 'paid_by'>>,
    items?: Omit<ExpenseItem, 'created_at' | 'expense_id' | 'id'>[]
  ) {
    if (items) {
      const totalPrice = items.reduce((sum, item) => sum + item.price, 0);
      const { error: expenseError } = await supabase
        .from('expenses')
        .update({ ...updates, price: totalPrice })
        .eq('id', expenseId);
      
      if (expenseError) throw expenseError;

      // Delete existing items
      const { error: deleteError } = await supabase
        .from('expense_items')
        .delete()
        .eq('expense_id', expenseId);
      
      if (deleteError) throw deleteError;

      // Insert new items
      if (items.length > 0) {
        const itemsPayload = items.map(item => ({
          ...item,
          expense_id: expenseId,
          created_at: nowIso(),
        }));
        const { error: insertError } = await supabase
          .from('expense_items')
          .insert(itemsPayload);
        
        if (insertError) throw insertError;
      }
    } else {
      const { error } = await supabase
        .from('expenses')
        .update(updates)
        .eq('id', expenseId);
      
      if (error) throw error;
    }
  },
  async deleteExpense(expenseId: string) {
    // Check if user is authenticated
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('You must be logged in to delete expenses.');
    }
    
    const { data, error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', expenseId)
      .select('id, profile_id');
    
    if (error) throw new Error(error.message || 'Failed to delete expense');
    
    // RLS can block delete without returning error - check if row was actually deleted
    if (!data || data.length === 0) {
      throw new Error('Unable to delete expense. You may not have permission to delete this expense.');
    }
  },
  async clearPlanExpenses(planId: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('You must be logged in to reset expenses.');
    }

    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('plan_id', planId);

    if (error) throw error;
  },
  async fetchExpenses(planId: string) {
    const { data, error } = await supabase
      .from('expenses')
      .select('*, items:expense_items(*)')
      .eq('plan_id', planId)
      .order('date', { ascending: false });

    if (error) throw error;
    return (data ?? []) as ExpenseWithItems[];
  },
  async fetchProfileExpenses(profileId: string) {
    const { data, error } = await supabase
      .from('expenses')
      .select('*, items:expense_items(*)')
      .eq('profile_id', profileId)
      .order('date', { ascending: false });

    if (error) throw error;
    return (data ?? []) as ExpenseWithItems[];
  },
  async fetchExpenseItems(expenseId: string) {
    const { data, error } = await supabase
      .from('expense_items')
      .select('*')
      .eq('expense_id', expenseId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data ?? []) as ExpenseItem[];
  },
};

export const shoppingApi = {
  async addItem(input: Omit<ShoppingItem, 'bought_at' | 'bought_by' | 'created_at' | 'id' | 'is_bought'>) {
    const payload = { ...input, bought_at: null, bought_by: null, created_at: nowIso(), is_bought: false };
    const { data, error } = await supabase.from('buy_list_items').insert(payload).select('*').single();
    if (error) throw error;
    return data as ShoppingItem;
  },
  async clearBought(profileId: string) {
    const { error } = await supabase.from('buy_list_items').delete().eq('profile_id', profileId).eq('is_bought', true);
    if (error) throw error;
  },
  async fetchItems(profileId: string) {
    const { data, error } = await supabase
      .from('buy_list_items')
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as ShoppingItem[];
  },
  async markBought(itemId: string, userId: string, linkedExpenseId?: string) {
    const payload: any = { bought_at: nowIso(), bought_by: userId, is_bought: true };
    if (linkedExpenseId) {
      payload.linked_expense_id = linkedExpenseId;
    }
    const { data, error } = await supabase.from('buy_list_items').update(payload).eq('id', itemId).select('*').single();
    if (error) throw error;
    return data as ShoppingItem;
  },
  async markUnbought(itemId: string) {
    const payload = { bought_at: null, bought_by: null, is_bought: false, linked_expense_id: null };
    const { data, error } = await supabase.from('buy_list_items').update(payload).eq('id', itemId).select('*').single();
    if (error) throw error;
    return data as ShoppingItem;
  },
  async deleteItem(itemId: string) {
    const { error } = await supabase.from('buy_list_items').delete().eq('id', itemId);
    if (error) throw error;
  },
};

export const notificationApi = {
  async createForMembers(profileId: string, userIds: string[], message: string, type: string) {
    if (!userIds.length) return;

    const rows = userIds.map((userId) => ({
      created_at: nowIso(),
      is_read: false,
      message,
      profile_id: profileId,
      type,
      user_id: userId,
    }));

    const { error } = await supabase.from('notifications').insert(rows);
    if (error) throw error;
  },
  async fetchForUser(profileId: string, userId: string) {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('profile_id', profileId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    return (data ?? []) as AppNotification[];
  },
  async markAllRead(profileId: string, userId: string) {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('profile_id', profileId)
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) throw error;
  },
  async markRead(id: string) {
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    if (error) throw error;
  },
};

export const inviteApi = {
  async acceptInvite(session: Session, inviteToken: string) {
    return callBackend<{ profile_id: string }>('/invitations/accept', session.access_token, {
      invite_token: inviteToken,
    });
  },
  async sendInvite(session: Session, payload: InvitePayload) {
    return callBackend<{ invite_token: string; shareable_link: string }>('/invitations/send', session.access_token, payload);
  },
};

export const pushApi = {
  async fanOut(session: Session, payload: Record<string, unknown>) {
    return callBackend<{ sent: number }>('/push/fanout', session.access_token, payload);
  },
  async registerToken(session: Session, token: string, platform: string) {
    return callBackend('/push/register', session.access_token, {
      platform,
      push_token: token,
    });
  },
};

export const billApi = {
  async fetchTrackers(profileId: string) {
    const { data, error } = await supabase.from('bill_trackers').select('*').eq('profile_id', profileId).order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as BillTrackerMeta[];
  },
  async createTracker(input: Omit<BillTrackerMeta, 'created_at' | 'id'>) {
    const payload = { ...input, created_at: new Date().toISOString() };
    const { data, error } = await supabase.from('bill_trackers').insert(payload).select('*').single();
    if (error) throw error;
    return data as BillTrackerMeta;
  },
  async updateTracker(trackerId: string, updates: { name: string }) {
    const { data, error } = await supabase.from('bill_trackers').update(updates).eq('id', trackerId).select('*').single();
    if (error) throw error;
    return data as BillTrackerMeta;
  },
  async deleteTracker(trackerId: string) {
    const { error } = await supabase.from('bill_trackers').delete().eq('id', trackerId);
    if (error) throw error;
  },
  async fetchRecurringBills(profileId: string) {
    const { data, error } = await supabase.from('recurring_bills').select('*').eq('profile_id', profileId).order('due_day', { ascending: true });
    if (error) throw error;
    return (data ?? []) as RecurringBill[];
  },
  async createRecurringBill(input: Omit<RecurringBill, 'created_at' | 'id'>) {
    const payload = { ...input, created_at: new Date().toISOString() };
    const { data, error } = await supabase.from('recurring_bills').insert(payload).select('*').single();
    if (error) throw error;
    return data as RecurringBill;
  },
  async updateRecurringBill(billId: string, updates: Partial<Pick<RecurringBill, 'category' | 'due_day' | 'is_active' | 'is_recurring' | 'name' | 'notify_days_before'>>) {
    const { data, error } = await supabase.from('recurring_bills').update(updates).eq('id', billId).select('*').single();
    if (error) throw error;
    return data as RecurringBill;
  },
  async deleteRecurringBill(billId: string) {
    const { error } = await supabase.from('recurring_bills').delete().eq('id', billId);
    if (error) throw error;
  },
  async fetchPayments(profileId: string) {
    const { data, error } = await supabase
      .from('bill_payments')
      .select(billPaymentColumns)
      .eq('profile_id', profileId)
      .order('year', { ascending: false })
      .order('month', { ascending: false });
    if (error) throw error;
    return ((data ?? []).map((payment) => ({ ...payment, name: null })) as BillPayment[]);
  },
  async addPayment(input: BillPaymentInsert) {
    const payload = {
      added_by: input.added_by,
      amount: input.amount,
      bill_id: input.bill_id,
      created_at: new Date().toISOString(),
      date: input.date,
      month: input.month,
      plan_id: input.plan_id,
      profile_id: input.profile_id,
      status: input.status,
      tracker_id: input.tracker_id,
      units: input.units,
      year: input.year,
    };
    const { data, error } = await supabase
      .from('bill_payments')
      .insert(payload)
      .select(billPaymentColumns)
      .single();
    if (error) throw error;
    return { ...data, name: null } as BillPayment;
  },
  async updatePayment(paymentId: string, updates: Partial<Pick<BillPayment, 'amount' | 'plan_id' | 'status' | 'units'>>) {
    const { data, error } = await supabase.from('bill_payments').update(updates).eq('id', paymentId).select(billPaymentColumns).single();
    if (error) throw error;
    return { ...data, name: null } as BillPayment;
  },
  async deletePayment(paymentId: string) {
    const { error } = await supabase.from('bill_payments').delete().eq('id', paymentId);
    if (error) throw error;
  },
};

export const savingsApi = {
  async fetchTrackers(profileId: string) {
    const { data, error } = await supabase.from('savings_trackers').select('*').eq('profile_id', profileId).order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as SavingsTrackerMeta[];
  },
  async createTracker(input: Omit<SavingsTrackerMeta, 'created_at' | 'id'>) {
    const payload = { ...input, created_at: new Date().toISOString() };
    const { data, error } = await supabase.from('savings_trackers').insert(payload).select('*').single();
    if (error) throw error;
    return data as SavingsTrackerMeta;
  },
  async updateTracker(trackerId: string, updates: { name: string }) {
    const { data, error } = await supabase.from('savings_trackers').update(updates).eq('id', trackerId).select('*').single();
    if (error) throw error;
    return data as SavingsTrackerMeta;
  },
  async deleteTracker(trackerId: string) {
    const { error } = await supabase.from('savings_trackers').delete().eq('id', trackerId);
    if (error) throw error;
  },
  async fetchSavings(profileId: string) {
    const { data, error } = await supabase.from('savings').select('*').eq('profile_id', profileId).order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []) as SavingsEntry[];
  },
  async addEntry(input: Omit<SavingsEntry, 'created_at' | 'id'>) {
    const payload = { ...input, created_at: new Date().toISOString() };
    const { data, error } = await supabase.from('savings').insert(payload).select('*').single();
    if (error) throw error;
    return data as SavingsEntry;
  },
  async deleteEntry(entryId: string) {
    const { error } = await supabase.from('savings').delete().eq('id', entryId);
    if (error) throw error;
  },
};

export const validateSession = (session: Session | null) => requireValue(session, 'Please sign in again to continue.');
