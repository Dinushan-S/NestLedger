import { useEffect } from "react";
import { AppState } from "react-native";

import { supabase } from "@/lib/supabase";


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
					if (nextId) seenNotificationIds.current.add(nextId);
					// Remote push owns OS alerts in every app state. Realtime only refreshes
					// the inbox, avoiding a second local banner for the same event.
					refreshProfileData(activeProfileId);
				},
			)
			.subscribe();
		const subscription = AppState.addEventListener("change", (state) => {
			if (state === "active") void refreshProfileData(activeProfileId, true);
		});

		return () => {
			subscription.remove();
			supabase.removeChannel(channel);
		};
	}, [activeProfileId, refreshProfileData, seenNotificationIds, sessionUserId]);
}
