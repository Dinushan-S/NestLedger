jest.mock("expo-notifications", () => {
	throw new Error("The expo-notifications root module must not load at startup.");
});

import {
	AndroidImportance,
	SchedulableTriggerInputTypes,
	setNotificationHandler,
} from "./notifications";

it("loads local notification APIs without evaluating the remote-push package root", () => {
	expect(AndroidImportance.HIGH).toBeDefined();
	expect(SchedulableTriggerInputTypes.DAILY).toBe("daily");
	expect(setNotificationHandler).toEqual(expect.any(Function));
});
