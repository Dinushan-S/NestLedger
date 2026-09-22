/**
 * Guard against drift between the in-app notification titles and the push
 * notification titles hardcoded in backend/server.py (push_fanout's
 * NOTIFICATION_TITLES). The backend has no access to this module, so the two
 * maps are kept in sync manually — this test fails loudly when they diverge.
 */
import { needsSpaceTypeMigration, notificationTitles } from "./nestledger.constants";

// Mirror of backend/server.py -> push_fanout -> NOTIFICATION_TITLES.
// When adding a new notification type, update BOTH maps (and this test).
const BACKEND_NOTIFICATION_TITLES = {
	expense_added: "Budget updated",
	member_joined: "New member joined",
	shopping_item_added: "Shopping list updated",
	shopping_item_bought: "Shopping item bought",
} as const;

describe("notificationTitles", () => {
	it("matches the backend push titles in backend/server.py", () => {
		expect(notificationTitles).toEqual(BACKEND_NOTIFICATION_TITLES);
	});
});

describe("needsSpaceTypeMigration", () => {
	it("does not prompt again when the profile has a persisted space type", () => {
		expect(needsSpaceTypeMigration("family")).toBe(false);
		expect(needsSpaceTypeMigration("personal")).toBe(false);
	});

	it("prompts only when the profile value is missing", () => {
		expect(needsSpaceTypeMigration(null)).toBe(true);
		expect(needsSpaceTypeMigration(undefined)).toBe(true);
	});
});
