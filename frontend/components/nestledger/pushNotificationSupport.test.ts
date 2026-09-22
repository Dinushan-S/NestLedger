import {
	canRegisterForRemotePush,
	registerRemotePushWhenSupported,
} from "./pushNotificationSupport";

const expoGoRemotePushError =
	"expo-notifications: Android Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go with the release of SDK 53.";

describe("canRegisterForRemotePush", () => {
	it("does not attempt Android remote-push registration inside Expo Go", () => {
		expect(
			canRegisterForRemotePush({
				isPhysicalDevice: true,
				platform: "android",
				isExpoGo: true,
			}),
		).toBe(false);
	});

	it("allows Android remote-push registration in a development build", () => {
		expect(
			canRegisterForRemotePush({
				isPhysicalDevice: true,
				platform: "android",
				isExpoGo: false,
			}),
		).toBe(true);
	});

	it("does not register a remote-push token on a simulator", () => {
		expect(
			canRegisterForRemotePush({
				isPhysicalDevice: false,
				platform: "android",
				isExpoGo: false,
			}),
		).toBe(false);
	});

	it("does not disable the iOS path based on an Android-only limitation", () => {
		expect(
			canRegisterForRemotePush({
				isPhysicalDevice: true,
				platform: "ios",
				isExpoGo: true,
			}),
		).toBe(true);
	});

	it("does not reach the Expo token request when the native module identifies Expo Go", async () => {
		const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
		const requestToken = jest.fn(async () => {
			console.error(expoGoRemotePushError);
		});

		try {
			await registerRemotePushWhenSupported(
				{
					isPhysicalDevice: true,
					platform: "android",
					isExpoGo: true,
				},
				requestToken,
			);

			expect(requestToken).not.toHaveBeenCalled();
			expect(error).not.toHaveBeenCalledWith(expoGoRemotePushError);
		} finally {
			error.mockRestore();
		}
	});
});
