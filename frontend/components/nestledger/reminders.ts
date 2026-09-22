import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Notifications from "../../lib/notifications";

// Serialize replacements so rapid edits and refreshes cannot leave duplicate alarms.
let pending: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const result = pending.then(work, work);
  pending = result.catch(() => undefined);
  return result;
}

export const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

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

export function cancelExpenseReminders() {
  return serial(async () => {
    if (Platform.OS === "web") return;
    const legacyId = await AsyncStorage.getItem("nestledger-daily-reminder-notification");
    for (const item of await Notifications.getAllScheduledNotificationsAsync()) {
      if (item.identifier === legacyId || item.content.data?.type === "daily_expense_reminder") {
        await Notifications.cancelScheduledNotificationAsync(item.identifier);
      }
    }
  });
}
