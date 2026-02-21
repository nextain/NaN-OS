/**
 * Minimal structured logger for Phase 1.
 * Replaces forbidden console.log/warn/error.
 * TODO: Replace with @naia/shared/logger in Phase 2.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

const currentLevel: LogLevel = "debug";

function shouldLog(level: LogLevel): boolean {
	return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
}

function formatMessage(
	level: LogLevel,
	component: string,
	message: string,
	data?: Record<string, unknown>,
): string {
	const timestamp = new Date().toISOString();
	const base = `[${timestamp}] [${level.toUpperCase()}] [${component}] ${message}`;
	if (data) {
		return `${base} ${JSON.stringify(data)}`;
	}
	return base;
}

// biome-ignore lint/complexity/noStaticOnlyClass: Logger is intentionally a static utility
export class Logger {
	static debug(
		component: string,
		message: string,
		data?: Record<string, unknown>,
	) {
		if (!shouldLog("debug")) return;
		globalThis.console.debug(formatMessage("debug", component, message, data));
	}

	static info(
		component: string,
		message: string,
		data?: Record<string, unknown>,
	) {
		if (!shouldLog("info")) return;
		globalThis.console.info(formatMessage("info", component, message, data));
	}

	static warn(
		component: string,
		message: string,
		data?: Record<string, unknown>,
	) {
		if (!shouldLog("warn")) return;
		globalThis.console.warn(formatMessage("warn", component, message, data));
	}

	static error(
		component: string,
		message: string,
		data?: Record<string, unknown>,
	) {
		if (!shouldLog("error")) return;
		globalThis.console.error(formatMessage("error", component, message, data));
	}
}
