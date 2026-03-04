import { Client, GatewayIntentBits, Partials } from "discord.js";
import type {
	ChannelAdapter,
	ChannelMessage,
	ChannelResponse,
} from "./types.js";

interface DiscordConfig {
	botToken: string;
	mentionOnly: boolean;
}

export class DiscordAdapter implements ChannelAdapter {
	readonly platform = "discord";
	private client: Client;
	private config: DiscordConfig;
	private connected = false;
	private messageHandler:
		| ((msg: ChannelMessage) => Promise<ChannelResponse>)
		| null = null;

	constructor(config: DiscordConfig) {
		this.config = config;
		this.client = new Client({
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.MessageContent,
				GatewayIntentBits.DirectMessages,
			],
			partials: [Partials.Channel, Partials.Message],
		});
	}

	async start(): Promise<void> {
		this.client.on("messageCreate", (msg: any) =>
			this.handleMessageCreate(msg),
		);

		this.client.on("ready", () => {
			this.connected = true;
		});

		await this.client.login(this.config.botToken);
		this.connected = true;
	}

	async stop(): Promise<void> {
		this.client.destroy();
		this.connected = false;
	}

	isConnected(): boolean {
		return this.connected;
	}

	onMessage(
		handler: (msg: ChannelMessage) => Promise<ChannelResponse>,
	): void {
		this.messageHandler = handler;
	}

	/** Exposed for testing — normally called by discord.js event */
	handleMessageCreate(msg: any): void {
		// Ignore bot messages
		if (msg.author.bot) return;

		const isDM = msg.guild === null;

		// In mentionOnly mode, ignore non-DM messages without bot mention
		if (this.config.mentionOnly && !isDM) {
			const botMentioned = msg.mentions.has(this.client.user);
			if (!botMentioned) return;
		}

		if (!this.messageHandler) return;

		// Strip bot mention from content
		let text = msg.content;
		if (this.client.user) {
			text = text
				.replace(new RegExp(`<@!?${this.client.user.id}>`, "g"), "")
				.trim();
		}

		const channelMessage: ChannelMessage = {
			id: msg.id,
			channelId: msg.channel.id,
			userId: msg.author.id,
			userName: msg.author.username,
			text,
			platform: "discord",
			isDM,
			timestamp: msg.createdTimestamp,
		};

		this.messageHandler(channelMessage)
			.then((response) => {
				// Discord has 2000-char limit
				const text =
					response.text.length > 2000
						? `${response.text.slice(0, 1997)}...`
						: response.text;
				msg.reply(text).catch(() => {
					msg.channel.send(text).catch(() => {});
				});
			})
			.catch((err: unknown) => {
				console.error("[discord] message handler error:", err);
			});
	}
}
