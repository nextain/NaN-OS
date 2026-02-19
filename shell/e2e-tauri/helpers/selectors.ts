/** CSS selectors verified against shell/src components. */
export const S = {
	// App
	appRoot: ".app-root",

	// SettingsTab (8th tab: chat, history, progress, skills, channels, agents, diagnostics, settings)
	settingsTab: ".settings-tab",
	settingsTabBtn: ".chat-tab:nth-child(8)",
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

	// History tab (2nd tab: chat, history, progress, skills, channels, agents, settings)
	historyTab: ".chat-tab:nth-child(2)",
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
	onboardingLabSection: ".onboarding-lab-section",
	onboardingLabBtn: ".onboarding-lab-btn",
	onboardingLabDesc: ".onboarding-lab-desc",
	onboardingDivider: ".onboarding-divider",

	// Lab (Settings + CostDashboard)
	labConnectedRow: ".lab-connected-row",
	labBalanceSection: ".lab-balance-section",
	labBalanceRow: ".lab-balance-row",
	labChargeBtn: ".lab-charge-btn",

	// Skills tab (4th tab: chat, history, progress, skills, channels, agents, settings)
	skillsTab: ".chat-tab:nth-child(4)",
	skillsTabPanel: ".skills-tab",
	skillsSearch: ".skills-search",
	skillsCard: ".skill-card",
	skillsCardName: ".skill-card-name",
	skillsToggle: ".skill-toggle input",
	skillsSectionTitle: ".skills-section-title",
	skillsCount: ".skills-count",
	skillsEnableAllBtn: ".skills-action-btn:first-child",
	skillsDisableAllBtn: ".skills-action-btn:last-child",
	gatewaySkillCard: '[data-testid="gateway-skill-card"]',
	skillsInstallBtn: '[data-testid="skills-install-btn"]',

	// Channels tab (5th tab: chat, history, progress, skills, channels, agents, settings)
	channelsTabBtn: ".chat-tab:nth-child(5)",
	channelsTabPanel: '[data-testid="channels-tab"]',
	channelCard: '[data-testid="channel-card"]',
	channelAccount: '[data-testid="channel-account"]',
	channelStatus: '[data-testid="channel-status"]',
	channelsSettingsHint: '[data-testid="channels-settings-hint"]',
	channelLoginBtn: ".channel-action-btn.login",
	channelLogoutBtn: ".channel-action-btn.logout",
	channelsRefreshBtn: ".channels-refresh-btn",

	// Agents tab (6th tab: chat, history, progress, skills, channels, agents, settings)
	agentsTabBtn: ".chat-tab:nth-child(6)",
	agentsTabPanel: '[data-testid="agents-tab"]',
	agentCard: '[data-testid="agent-card"]',
	sessionCard: '[data-testid="session-card"]',
	agentsRefreshBtn: ".agents-refresh-btn",

	// Gateway TTS (Settings, Phase 5)
	gatewayTtsProvider: '[data-testid="gateway-tts-provider"]',

	// Voice Wake (Settings, Phase 5)
	voiceWakeTriggers: '[data-testid="voice-wake-triggers"]',
	voiceWakeInput: '[data-testid="voice-wake-input"]',
	voiceWakeSave: '[data-testid="voice-wake-save"]',

	// Diagnostics tab (7th tab: chat, history, progress, skills, channels, agents, diagnostics, settings)
	diagnosticsTabBtn: ".chat-tab:nth-child(7)",
	diagnosticsTabPanel: '[data-testid="diagnostics-tab"]',
	diagnosticsStatusGrid: ".diagnostics-status-grid",
	diagnosticsStatusItem: ".diagnostics-status-item",
	diagnosticsStatusOk: ".diagnostics-value.status-ok",
	diagnosticsStatusErr: ".diagnostics-value.status-err",
	diagnosticsRefreshBtn: ".diagnostics-refresh-btn",
	diagnosticsLogBtn: ".diagnostics-log-btn",
	diagnosticsLogsContainer: ".diagnostics-logs-container",

	// Agent file management (AgentsTab)
	agentFilesBtn: ".agent-files-btn",
	agentFileItem: ".agent-file-item",
	agentFileTextarea: ".agent-file-textarea",
	agentFileSaveBtn: ".agent-file-save-btn",

	// Session actions (AgentsTab)
	sessionCompactBtn: ".session-action-btn.compact",
	sessionDeleteBtn: ".session-action-btn.delete",

	// Device pairing (SettingsTab)
	deviceNodeCard: ".device-node-card",
	deviceNodesList: ".device-nodes-list",
	devicePairRequests: ".device-pair-requests",
	devicePairApprove: ".device-pair-approve",
	devicePairReject: ".device-pair-reject",

	// Queue badge
	queueBadge: ".queue-badge",
} as const;
