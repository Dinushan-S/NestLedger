import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { RecurringExpense } from "../../lib/nestledger";

// Serialize replacements so rapid edits and refreshes cannot leave duplicate alarms.
let pending: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const result = pending.then(work, work);
  pending = result.catch(() => undefined);
  return result;
}

export const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function nextRecurringDueDate(
  dueDate: string,
  frequency: RecurringExpense["frequency"],
  now = new Date(),
) {
  const origin = new Date(`${dueDate}T12:00:00`);
  if (!Number.isFinite(origin.getTime()) || localDate(origin) !== dueDate) throw new Error("Invalid scheduled expense date.");
  const today = localDate(now);
  for (let step = 1; ; step++) {
    const date = new Date(origin);
    if (frequency === "daily" || frequency === "weekly") {
      date.setDate(origin.getDate() + step * (frequency === "weekly" ? 7 : 1));
    } else {
      date.setDate(1);
      if (frequency === "monthly") date.setMonth(origin.getMonth() + step);
      else date.setFullYear(origin.getFullYear() + step);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      date.setDate(Math.min(origin.getDate(), lastDay));
    }
    const result = localDate(date);
    if (result > today) return result;
  }
}

export async function requireNotificationPermission(request = true) {
  if (Platform.OS === "web") throw new Error("Reminders are available in the mobile app.");
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default", importance: Notifications.AndroidImportance.HIGH, sound: "default",
    });
  }
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && request) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error("Allow notifications in your phone settings to receive reminders.");
}

export function updateDailyReminder(enabled: boolean, time: string, requestPermission = true) {
  return serial(() => writeDailyReminder(enabled, time, requestPermission));
}

export function restoreDailyReminder() {
  return serial(async () => {
    const enabled = await AsyncStorage.getItem("nestledger-reminder-enabled") === "true";
    const time = await AsyncStorage.getItem("nestledger-reminder-time") || "20:00";
    await writeDailyReminder(enabled, time, false);
    return { enabled, time };
  });
}

async function writeDailyReminder(enabled: boolean, time: string, requestPermission: boolean) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time) && enabled) {
      throw new Error("Enter a valid time as HH:MM (24-hour).");
    }
    if (enabled) await requireNotificationPermission(requestPermission);
    if (Platform.OS === "web") return;
    const legacyId = await AsyncStorage.getItem("nestledger-daily-reminder-notification");
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const previous = scheduled.filter((item) =>
      item.identifier === legacyId || item.content.data?.type === "daily_expense_reminder",
    );
    let id: string | undefined;
    if (enabled) {
      const [hour, minute] = time.split(":").map(Number);
      // Create first: a scheduling error must not destroy the existing reminder.
      id = await Notifications.scheduleNotificationAsync({
        content: {
          title: "NestLedger Reminder", body: "Anything to add for today?",
          sound: "default", data: { type: "daily_expense_reminder" },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: "default" },
      });
    }
    for (const item of previous) await Notifications.cancelScheduledNotificationAsync(item.identifier);
    if (id) await AsyncStorage.setItem("nestledger-daily-reminder-notification", id);
    else await AsyncStorage.removeItem("nestledger-daily-reminder-notification");
    await AsyncStorage.setItem("nestledger-reminder-enabled", String(enabled));
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) await AsyncStorage.setItem("nestledger-reminder-time", time);
}

export function syncRecurringReminders(profileId: string, expenses: RecurringExpense[]) {
  return serial(async () => {
    if (Platform.OS === "web") return;
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const existing = scheduled.filter((item) =>
      item.content.data?.type === "recurring_expense_due" && item.content.data?.profile_id === profileId,
    );
    const desired = expenses.filter((item) => item.is_active && item.profile_id === profileId);
    const keep = new Set<string>();
    // Cancel deleted/disabled templates even when notification permission was revoked.
    for (const item of existing) {
      if (!desired.some((expense) => expense.id === item.content.data?.recurring_expense_id)) {
        await Notifications.cancelScheduledNotificationAsync(item.identifier);
      }
    }
    if (!desired.length) return;
    await requireNotificationPermission(false);
    for (const expense of desired) {
      const date = new Date(`${expense.next_due_date}T${expense.reminder_time || "09:00"}:00`);
      if (!Number.isFinite(date.getTime())) continue;
      const overdue = date.getTime() <= Date.now();
      // Overdue, unconfirmed expenses get a daily nudge until reviewed.
      const signature = JSON.stringify([expense.next_due_date, expense.reminder_time, expense.name, overdue]);
      const matches = existing.filter((item) => item.content.data?.recurring_expense_id === expense.id);
      const match = matches.find((item) => item.content.data?.signature === signature);
      if (match) keep.add(match.identifier);
      else {
        const [hour, minute] = (expense.reminder_time || "09:00").split(":").map(Number);
        await Notifications.scheduleNotificationAsync({
          content: {
            title: overdue ? "Scheduled expense needs review" : "Scheduled expense due",
            body: `Review ${expense.name} and save it when you are ready.`, sound: "default",
            data: { type: "recurring_expense_due", profile_id: profileId, recurring_expense_id: expense.id, signature },
          },
          trigger: overdue
            ? { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: "default" }
            : { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: "default" },
        });
      }
      for (const item of matches) {
        if (!keep.has(item.identifier)) await Notifications.cancelScheduledNotificationAsync(item.identifier);
      }
    }
  });
}

export function cancelExpenseReminders() {
  return serial(async () => {
    if (Platform.OS === "web") return;
    const legacyId = await AsyncStorage.getItem("nestledger-daily-reminder-notification");
    for (const item of await Notifications.getAllScheduledNotificationsAsync()) {
      if (item.identifier === legacyId || ["daily_expense_reminder", "recurring_expense_due"].includes(String(item.content.data?.type))) {
        await Notifications.cancelScheduledNotificationAsync(item.identifier);
      }
    }
  });
}
