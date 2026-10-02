import { useEffect, useRef } from "react";

import { todayLocalDate } from "../../../constants/nestledger";
import type { BudgetPlan, ExpenseShortcut } from "../../../lib/nestledger";
import { expenseWidget, expenseWidgetAvailable, expenseWidgetStorage } from "../../../lib/expenseWidget";
import { supabase } from "../../../lib/supabase";
import { expenseShortcutTotal } from "../expenseSuggestions";

type Options = {
	userId: string | undefined;
	profileId: string | null;
	dataReadyProfileId: string | null;
	plans: BudgetPlan[];
	shortcuts: ExpenseShortcut[];
	currency: string;
};

export function useExpenseWidgetSetup({ userId, profileId, dataReadyProfileId, plans, shortcuts, currency }: Options) {
	const queue = useRef<Promise<void>>(Promise.resolve());
	const generation = useRef(0);
	const previewed = useRef("");
	const synced = useRef("");

	useEffect(() => {
		const current = ++generation.current;
		if (!userId || !profileId) {
			previewed.current = "";
			synced.current = "";
			return;
		}
		if (!expenseWidgetAvailable || dataReadyProfileId !== profileId) return;

		const today = todayLocalDate();
		const plan = plans.find((item) => item.start_date.slice(0, 10) <= today && item.end_date.slice(0, 10) >= today) ?? plans[0];
		const snapshot = shortcuts.slice(0, 10).map((item) => ({
			id: item.id,
			name: item.name,
			amount: expenseShortcutTotal(item),
			currency,
		}));
		const owner = { userId, profileId };
		const signature = JSON.stringify({ owner, planId: plan?.id, snapshot });

		queue.current = queue.current.catch(() => undefined).then(async () => {
			if (current !== generation.current) return;
			const previousOwner = await expenseWidgetStorage.getOwner();
			let token = await expenseWidget.token();
			if (current !== generation.current) return;
			if (synced.current === signature && token) return;

			if (!previousOwner || previousOwner.userId !== userId || previousOwner.profileId !== profileId) {
				if (token && previousOwner?.userId === userId) {
					const { data } = await supabase.auth.getSession();
					if (data.session?.access_token) await expenseWidget.revokeSession(token, data.session.access_token).catch(() => undefined);
				}
				await expenseWidget.clear();
				await expenseWidgetStorage.clearOwner();
				previewed.current = "";
				synced.current = "";
				token = null;
			}

			if (current !== generation.current) return;
			if (!plan || !snapshot.length) {
				if (token) {
					const { data } = await supabase.auth.getSession();
					if (data.session?.access_token) await expenseWidget.revokeSession(token, data.session.access_token).catch(() => undefined);
				}
				await expenseWidget.clear();
				await expenseWidgetStorage.clearOwner();
				previewed.current = "";
				synced.current = signature;
				return;
			}

			// Show saved shortcuts on the home screen even while the one-tap service is unavailable.
			if (previewed.current !== signature) {
				await expenseWidget.configure(token ?? "", plan.id, snapshot);
				await expenseWidgetStorage.setOwner(owner);
				previewed.current = signature;
			}
			if (token) {
				synced.current = signature;
				return;
			}

			const { data } = await supabase.auth.getSession();
			if (!data.session?.access_token || current !== generation.current) return;
			const newToken = await expenseWidget.createSession(profileId, data.session.access_token);
			if (current !== generation.current) {
				await expenseWidget.revokeSession(newToken, data.session.access_token).catch(() => undefined);
				return;
			}
			await expenseWidget.configure(newToken, plan.id, snapshot);
			synced.current = signature;
		}).catch(() => undefined);
	}, [userId, profileId, dataReadyProfileId, plans, shortcuts, currency]);
}
