type RemotePushRuntime = {
	isPhysicalDevice: boolean;
	platform: string;
	isExpoGo: boolean;
};

export function canRegisterForRemotePush(runtime: RemotePushRuntime): boolean {
	return (
		runtime.isPhysicalDevice &&
		!(runtime.platform === "android" && runtime.isExpoGo)
	);
}

export async function registerRemotePushWhenSupported(
	runtime: RemotePushRuntime,
	register: () => Promise<void>,
): Promise<boolean> {
	if (!canRegisterForRemotePush(runtime)) return false;
	await register();
	return true;
}
