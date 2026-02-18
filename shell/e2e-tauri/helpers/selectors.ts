/** CSS selectors verified against shell/src components. */
export const S = {
	// App
	appRoot: ".app-root",

	// SettingsTab
	settingsTab: ".settings-tab",
	chatTab: ".chat-tab:first-child",
	providerSelect: "#provider-select",
	apiKeyInput: "#apikey-input",
	toolsToggle: "#tools-toggle",
	gatewayUrlInput: "#gateway-url-input",
	gatewayTokenInput: "#gateway-token-input",
	settingsSaveBtn: ".settings-save-btn",

	// ChatPanel
	chatInput: ".chat-input",
	chatSendBtn: ".chat-send-btn",
	cursorBlink: ".cursor-blink",
	assistantMessage: ".chat-message.assistant .message-content",

	// Memory
	newChatBtn: ".new-chat-btn",
	userMessage: ".chat-message.user",
	completedAssistantMessage: ".chat-message.assistant:not(.streaming)",

	// ToolActivity
	toolActivity: ".tool-activity",
	toolSuccess: ".tool-activity.tool-success",
	toolName: ".tool-name",

	// PermissionModal
	permissionAlways: ".permission-btn-always",

	// History tab
	historyTab: ".chat-tab:nth-child(4)",
	historyItem: ".history-item",
	historyItemTitle: ".history-item-title",
	historyDeleteBtn: ".history-delete-btn",
	historyEmpty: ".history-tab-empty",
	historyCurrentBadge: ".history-current-badge",

	// Cost dashboard
	costBadge: ".cost-badge-clickable",
	costDashboard: ".cost-dashboard",
	costTable: ".cost-table",

	// Onboarding wizard
	onboardingOverlay: ".onboarding-overlay",
	onboardingNextBtn: ".onboarding-next-btn",
	onboardingSkipBtn: ".onboarding-skip-btn",
	onboardingBackBtn: ".onboarding-back-btn",
	onboardingInput: ".onboarding-input",
	onboardingProviderCard: ".onboarding-provider-card",
	onboardingVrmCard: ".onboarding-vrm-card",
	onboardingPersonalityCard: ".onboarding-personality-card",
	onboardingValidateBtn: ".onboarding-validate-btn",
	onboardingValidationSuccess: ".onboarding-validation-success",

	// Queue badge
	queueBadge: ".queue-badge",
} as const;
