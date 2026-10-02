import AsyncStorage from "@react-native-async-storage/async-storage";
import { isRunningInExpoGo, requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

import { appConfig } from "./config";

type NativeExpenseWidget = {
	configureAsync(token: string, apiBaseUrl: string, planId: string, shortcutsJson: string): Promise<void>;
	getTokenAsync(): Promise<string | null>;
	clearAsync(): Promise<void>;
	setThemeAsync?(mode: string): Promise<void>;
};

export type ExpenseWidgetOwner = { userId: string; profileId: string };
export type ExpenseWidgetShortcut = { id: string; name: string; amount: number; currency: string };

const module = Platform.OS === "web" || isRunningInExpoGo()
	? null
	: requireOptionalNativeModule<NativeExpenseWidget>("ExpenseWidget");
const ownerKey = "nestledger-expense-widget-owner";

export const expenseWidgetAvailable = Boolean(module);

export const expenseWidgetStorage = {
	async getOwner(): Promise<ExpenseWidgetOwner | null> {
		const value = await AsyncStorage.getItem(ownerKey);
		if (!value) return null;
		try { return JSON.parse(value) as ExpenseWidgetOwner; } catch { return null; }
	},
	async setOwner(owner: ExpenseWidgetOwner) {
		await AsyncStorage.setItem(ownerKey, JSON.stringify(owner));
	},
	async clearOwner() {
		await AsyncStorage.removeItem(ownerKey);
	},
};

const request = async (method: "POST" | "DELETE", accessToken: string, body: object) => {
	const response = await fetch(`${appConfig.backendUrl}/api/widget/session`, {
		method,
		headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		const json = await response.json().catch(() => null);
		throw new Error(typeof json?.detail === "string" ? json.detail : `Widget setup failed (${response.status}).`);
	}
	return response.json();
};

export const expenseWidget = {
	async setTheme(mode: "system" | "light" | "dark") { await module?.setThemeAsync?.(mode); },
	async token() { return module?.getTokenAsync() ?? null; },
	async createSession(profileId: string, accessToken: string): Promise<string> {
		const data = await request("POST", accessToken, { profile_id: profileId });
		if (typeof data?.token !== "string") throw new Error("Widget session response was invalid.");
		return data.token;
	},
	async revokeSession(token: string, accessToken: string) {
		await request("DELETE", accessToken, { token });
	},
	async configure(token: string, planId: string, shortcuts: ExpenseWidgetShortcut[]) {
		if (!module) throw new Error("Home screen widgets require an installed app build.");
		await module.configureAsync(token, `${appConfig.backendUrl}/api`, planId, JSON.stringify(shortcuts));
	},
	async clear() { await module?.clearAsync(); },
};
