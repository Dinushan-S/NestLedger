import type {
	ExpoPushToken,
	ExpoPushTokenOptions,
} from "expo-notifications/build/Tokens.types";

// Import local-notification modules directly. The package root eagerly loads its
// Android remote-push listener, which is unsupported and logs an error in Expo Go.
export { AndroidImportance } from "expo-notifications/build/NotificationChannelManager.types";
export { SchedulableTriggerInputTypes } from "expo-notifications/build/Notifications.types";
export {
	getPermissionsAsync,
	requestPermissionsAsync,
} from "expo-notifications/build/NotificationPermissions";
export { clearLastNotificationResponseAsync } from "expo-notifications/build/NotificationsEmitter";
export { setNotificationHandler } from "expo-notifications/build/NotificationsHandler";
export { default as cancelScheduledNotificationAsync } from "expo-notifications/build/cancelScheduledNotificationAsync";
export { default as getAllScheduledNotificationsAsync } from "expo-notifications/build/getAllScheduledNotificationsAsync";
export { default as scheduleNotificationAsync } from "expo-notifications/build/scheduleNotificationAsync";
export { default as setNotificationChannelAsync } from "expo-notifications/build/setNotificationChannelAsync";
export { default as useLastNotificationResponse } from "expo-notifications/build/useLastNotificationResponse";

export async function getExpoPushTokenAsync(
	options: ExpoPushTokenOptions = {},
): Promise<ExpoPushToken> {
	// This module activates remote-push auto-registration, so keep it out of the
	// Expo Go startup graph. The caller guards this path with isRunningInExpoGo().
	const { default: fetchExpoPushToken } = await import(
		"expo-notifications/build/getExpoPushTokenAsync"
	);
	return fetchExpoPushToken(options);
}
