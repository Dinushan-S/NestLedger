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
  id: string;
  paid_by: string | null;
  plan_id: string;
  price: number;
  profile_id: string;
  title: string;
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
  async addExpense(input: Omit<Expense, 'created_at' | 'id'>) {
    const payload = { ...input, created_at: nowIso() };
    const { data, error } = await supabase.from('expenses').insert(payload).select('*').single();
    if (error) throw error;
    return data as Expense;
  },
  async updateExpense(expenseId: string, updates: Partial<Pick<Expense, 'category' | 'date' | 'paid_by' | 'price' | 'title'>>) {
    const { data, error } = await supabase.from('expenses').update(updates).eq('id', expenseId).select('*').single();
    if (error) throw error;
    return data as Expense;
  },
  async fetchExpenses(planId: string) {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('plan_id', planId)
      .order('date', { ascending: false });

    if (error) throw error;
    return (data ?? []) as Expense[];
  },
  async fetchProfileExpenses(profileId: string) {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('profile_id', profileId)
      .order('date', { ascending: false });

    if (error) throw error;
    return (data ?? []) as Expense[];
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