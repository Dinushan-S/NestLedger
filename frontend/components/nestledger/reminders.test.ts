import * as Notifications from "../../lib/notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { cancelExpenseReminders, restoreDailyReminder, updateDailyReminder } from "./reminders";

jest.mock("../../lib/notifications", () => ({
  SchedulableTriggerInputTypes: { DAILY: "daily", DATE: "date" },
  AndroidImportance: { HIGH: 4 },
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  setNotificationChannelAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  scheduleNotificationAsync: jest.fn(async () => "new-id"),
  cancelScheduledNotificationAsync: jest.fn(),
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(), removeItem: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

it("enables a daily reminder explicitly, with an expense-form destination", async () => {
  await updateDailyReminder(true, "20:00");
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({
    content: expect.objectContaining({ data: { type: "daily_expense_reminder" } }),
    trigger: expect.objectContaining({ type: "daily", hour: 20, minute: 0 }),
  }));
});

it("rejects incomplete times without cancelling the working reminder", async () => {
  await expect(updateDailyReminder(true, "2:")).rejects.toThrow("HH:MM");
  expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
});

it("reports permission denial instead of pretending reminders are enabled", async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValueOnce({ granted: false } as never);
  jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValueOnce({ granted: false } as never);
  await expect(updateDailyReminder(true, "20:00")).rejects.toThrow("notification");
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

it("does not cancel the old daily alarm if scheduling its replacement fails", async () => {
  jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockResolvedValueOnce([
    { identifier: "working", content: { data: { type: "daily_expense_reminder" } } },
  ] as never);
  jest.mocked(Notifications.scheduleNotificationAsync).mockRejectedValueOnce(new Error("OS error"));
  await expect(updateDailyReminder(true, "21:00")).rejects.toThrow("OS error");
  expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  // A rejected operation must not prevent subsequent work on the queue.
  await expect(updateDailyReminder(true, "22:00")).resolves.toBeUndefined();
});

it("cancels only expense reminders on sign-out", async () => {
  jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockResolvedValueOnce([
    { identifier: "daily", content: { data: { type: "daily_expense_reminder" } } },
    { identifier: "other", content: { data: { type: "unrelated" } } },
  ] as never);
  await cancelExpenseReminders();
  expect(jest.mocked(Notifications.cancelScheduledNotificationAsync).mock.calls).toEqual([["daily"]]);
});

it("does not undo activation when foreground restoration races with the permission dialog", async () => {
  const storage = new Map([["nestledger-reminder-enabled", "false"]]);
  jest.mocked(AsyncStorage.getItem).mockImplementation(async (key) => storage.get(key) ?? null);
  jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => { storage.set(key, value); });
  try {
    const activation = updateDailyReminder(true, "21:30");
    const restoration = restoreDailyReminder();
    await activation;
    await expect(restoration).resolves.toEqual({ enabled: true, time: "21:30" });
    expect(storage.get("nestledger-reminder-enabled")).toBe("true");
  } finally {
    jest.mocked(AsyncStorage.getItem).mockImplementation(async () => null);
    jest.mocked(AsyncStorage.setItem).mockImplementation(async () => undefined);
  }
});
