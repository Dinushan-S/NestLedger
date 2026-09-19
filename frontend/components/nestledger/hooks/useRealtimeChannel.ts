import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { AppState } from "react-native";

import { supabase } from "@/lib/supabase";

import { notificationTitles } from "../nestledger.constants";

type UseRealtimeChannelOptions = {
	activeProfileId: string | null;
	refreshProfileData: (profileId: string, force?: boolean) => Promise<void>;
	seenNotificationIds: { current: Set<string> };
	sessionUserId: string | undefined;
};

// Tables whose row changes should trigger a profile-wide data refresh.
// expense_items has no profile_id column, so it is subscribed without a filter.
const PROFILE_TABLES: { filter?: boolean; table: string }[] = [
	{ filter: true, table: "budget_plans" },
	{ filter: true, table: "expenses" },
	{ table: "expense_items" },
	{ filter: true, table: "buy_list_items" },
	{ filter: true, table: "recurring_bills" },
	{ filter: true, table: "recurring_expenses" },
	{ filter: true, table: "bill_payments" },
	{ filter: true, table: "savings" },
	{ filter: true, table: "profile_members" },
];

export function useRealtimeChannel({
	activeProfileId,
	refreshProfileData,
	seenNotificationIds,
	sessionUserId,
}: UseRealtimeChannelOptions) {
	useEffect(() => {
		if (!sessionUserId || !activeProfileId) {
			return;
		}

		const profileFilter = `profile_id=eq.${activeProfileId}`;
		const channel = supabase.channel(
			`nestledger-${activeProfileId}-${sessionUserId}`,
		);

		for (const { filter, table } of PROFILE_TABLES) {
			channel.on(
				"postgres_changes",
				filter
					? { event: "*", filter: profileFilter, schema: "public", table }
					: { event: "*", schema: "public", table },
				() => {
					refreshProfileData(activeProfileId);
				},
			);
		}

		channel
			.on(
				"postgres_changes",
				{
					event: "*",
					filter: `user_id=eq.${sessionUserId}`,
					schema: "public",
					table: "notifications",
				},
				async (payload) => {
					const nextPayload = payload as {
						eventType: string;
						new?: {
							id?: string;
							message?: string;
							type?: string;
							profile_id?: string;
						};
					};
					const nextId = nextPayload.new?.id;
					const nextMessage = nextPayload.new?.message;
					const shouldNotify =
						nextPayload.eventType === "INSERT" &&
						nextId &&
						!seenNotificationIds.current.has(nextId);

					if (nextId) {
						seenNotificationIds.current.add(nextId);
					}

					// Only fire a local notification while foregrounded; when backgrounded or
					// killed the remote push (fanout) delivers it, so this avoids double-notify.
					if (
						shouldNotify &&
						nextMessage &&
						AppState.currentState === "active"
					) {
						await Notifications.scheduleNotificationAsync({
							content: {
								body: nextMessage,
								title:
									notificationTitles[nextPayload.new?.type ?? ""] ??
									"NestLedger update",
								data: {
									type: nextPayload.new?.type,
									profile_id: nextPayload.new?.profile_id ?? activeProfileId,
								},
							},
							trigger: null,
						}).catch(() => undefined);
					}

					refreshProfileData(activeProfileId);
				},
			)
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [activeProfileId, refreshProfileData, seenNotificationIds, sessionUserId]);
}
