import { Session, User } from '@supabase/supabase-js';

import { appConfig } from './config';
import { supabase } from './supabase';

export type UserProfile = {
  avatar_emoji: string | null;
  created_at: string;
  email: string;
  name: string;
  updated_at: string;
  user_id: string;
};

export type HouseholdProfile = {
  created_at: string;
  created_by: string;
  emoji_avatar: string | null;
  id: string;
  name: string;
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
  paid_by: string | null;
  plan_id: string;
  price: number;
  profile_id: string;
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

type AuthPayload = {
  email: string;
  password: string;
};

type CreateHouseholdPayload = {
  avatarEmoji: string;
  familyEmoji: string;
  familyName: string;
  name: string;
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
  async upsertUserProfile(user: User, values: { avatarEmoji: string; name: string }) {
    const payload = {
      avatar_emoji: values.avatarEmoji,
      created_at: nowIso(),
      email: user.email ?? '',
      name: values.name.trim(),
      updated_at: nowIso(),
      user_id: user.id,
    };

    const { data, error } = await supabase.from('user_profiles').upsert(payload).select('*').single();
    if (error) throw error;
    return data as UserProfile;
  },
  async createHousehold(payload: CreateHouseholdPayload) {
    await this.upsertUserProfile(payload.user, {
      avatarEmoji: payload.avatarEmoji,
      name: payload.name,
    });

    const profileInsert = {
      created_at: nowIso(),
      created_by: payload.user.id,
      emoji_avatar: payload.familyEmoji,
      name: payload.familyName.trim(),
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
  async updateHousehold(profileId: string, values: { emoji_avatar: string; name: string }) {
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
    console.log('addExpense called with input:', JSON.stringify(input, null, 2));
    
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
    
    console.log('Inserting expense with payload:', JSON.stringify(expensePayload, null, 2));
    
    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .insert(expensePayload)
      .select('*')
      .single();
    
    if (expenseError) {
      console.error('Expense insert error:', JSON.stringify(expenseError, null, 2));
      throw expenseError;
    }
    
    console.log('Expense inserted successfully:', JSON.stringify(expense, null, 2));

    if (items.length > 0) {
      const itemsPayload = items.map(item => ({
        ...item,
        expense_id: expense.id,
        created_at: nowIso(),
      }));
      
      console.log('Inserting items:', JSON.stringify(itemsPayload, null, 2));
      
      const { error: itemsError } = await supabase
        .from('expense_items')
        .insert(itemsPayload);
      
      if (itemsError) {
        console.error('Items insert error:', JSON.stringify(itemsError, null, 2));
        throw itemsError;
      }
      
      console.log('Items inserted successfully');
    }

    return { ...expense, items } as ExpenseWithItems;
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
    
    console.log('Deleting expense with user:', session.user.id);
    
    const { data, error, status } = await supabase
      .from('expenses')
      .delete()
      .eq('id', expenseId)
      .select('id, profile_id');
    
    if (error) {
      console.error('Delete expense error:', JSON.stringify({ code: error.code, details: error.details, hint: error.hint, message: error.message, status }));
      throw new Error(error.message || 'Failed to delete expense');
    }
    
    // RLS can block delete without returning error - check if row was actually deleted
    if (!data || data.length === 0) {
      console.error('Delete blocked - no rows affected. User may not be a member of profile.');
      throw new Error('Unable to delete expense. You may not have permission to delete this expense.');
    }
    
    console.log('Delete expense success:', { status, deleted: data });
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
  async markBought(itemId: string, userId: string) {
    const payload = { bought_at: nowIso(), bought_by: userId, is_bought: true };
    const { data, error } = await supabase.from('buy_list_items').update(payload).eq('id', itemId).select('*').single();
    if (error) throw error;
    return data as ShoppingItem;
  },
  async markUnbought(itemId: string) {
    const payload = { bought_at: null, bought_by: null, is_bought: false };
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

export const validateSession = (session: Session | null) => requireValue(session, 'Please sign in again to continue.');