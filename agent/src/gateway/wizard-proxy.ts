import type { GatewayClient } from "./client.js";

/** Start the onboarding wizard on Gateway */
export async function startWizard(
	client: GatewayClient,
): Promise<{ started: boolean; step: string; totalSteps: number }> {
	const payload = await client.request("wizard.start", {});
	return payload as { started: boolean; step: string; totalSteps: number };
}

/** Advance to the next wizard step */
export async function nextWizardStep(
	client: GatewayClient,
	data: Record<string, unknown>,
): Promise<{ step: string; stepIndex: number; totalSteps: number }> {
	const payload = await client.request("wizard.next", data);
	return payload as { step: string; stepIndex: number; totalSteps: number };
}

/** Cancel the wizard */
export async function cancelWizard(
	client: GatewayClient,
): Promise<{ cancelled: boolean }> {
	const payload = await client.request("wizard.cancel", {});
	return payload as { cancelled: boolean };
}

/** Get wizard status */
export async function getWizardStatus(client: GatewayClient): Promise<{
	active: boolean;
	step: string;
	stepIndex: number;
	totalSteps: number;
}> {
	const payload = await client.request("wizard.status", {});
	return payload as {
		active: boolean;
		step: string;
		stepIndex: number;
		totalSteps: number;
	};
}
