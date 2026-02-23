/**
 * Channel adapter interface for external messaging platforms.
 *
 * Each adapter bridges an external platform (Discord, Google Chat, etc.)
 * to the Naia Agent via the OpenClaw Gateway.
 *
 * Security: External channels are restricted to Tier 0-1 operations only.
 * No file writes, command execution, or admin actions.
 */

/** Incoming message from an external channel */
export interface ChannelMessage {
	/** Unique message ID from the platform */
	id: string;
	/** Channel identifier (e.g., Discord channel ID, Google Chat space ID) */
	channelId: string;
	/** User identifier on the platform */
	userId: string;
	/** Display name of the sender */
	userName: string;
	/** Message text content */
	text: string;
	/** Platform name */
	platform: "discord" | "google-chat";
	/** Whether this is a direct message (vs group/channel) */
	isDM: boolean;
	/** Original timestamp from the platform */
	timestamp: number;
}

/** Response to send back to the channel */
export interface ChannelResponse {
	/** Channel to send to */
	channelId: string;
	/** Response text */
	text: string;
	/** Optional: reply to a specific message */
	replyToId?: string;
}

/** Channel adapter lifecycle */
export interface ChannelAdapter {
	/** Platform identifier */
	readonly platform: string;
	/** Start listening for messages */
	start(): Promise<void>;
	/** Stop and disconnect */
	stop(): Promise<void>;
	/** Whether the adapter is currently connected */
	isConnected(): boolean;
	/** Register handler for incoming messages */
	onMessage(handler: (msg: ChannelMessage) => Promise<ChannelResponse>): void;
}

/** Configuration for channel adapters */
export interface ChannelConfig {
	discord?: {
		enabled: boolean;
		botToken: string;
		/** Only respond to mentions or DMs (prevent spam) */
		mentionOnly: boolean;
	};
	googleChat?: {
		enabled: boolean;
		/** Google Cloud project ID */
		projectId: string;
		/** HTTP webhook port */
		port: number;
	};
}
