import { useEffect, useState } from "react";
import { t } from "../lib/i18n";
import {
	normalizeProactiveSpeechSettings,
	type ProactiveSpeechSettings,
} from "../lib/proactive-speech-settings";

type ProactiveSettingsMode = "all" | "dj" | "exhibition";

function scopeProfile(
	value: ProactiveSpeechSettings,
	mode: ProactiveSettingsMode | undefined,
): ProactiveSpeechSettings {
	if (mode === "dj" && value.profile === "exhibition_intro") {
		return { ...value, profile: "disabled" };
	}
	if (mode === "exhibition" && value.profile === "personal_radio_dj") {
		return { ...value, profile: "disabled" };
	}
	return value;
}

export function ProactiveSpeechSettingsSection(props: {
	value: ProactiveSpeechSettings;
	mode?: ProactiveSettingsMode;
	onChange?: (value: ProactiveSpeechSettings) => void;
	onSave: (value: ProactiveSpeechSettings) => boolean | Promise<boolean>;
}) {
	const [draft, setDraft] = useState(() =>
		scopeProfile(props.value, props.mode),
	);
	const [saveFailed, setSaveFailed] = useState(false);
	useEffect(
		() => setDraft(scopeProfile(props.value, props.mode)),
		[props.value, props.mode],
	);
	const update = (patch: Partial<ProactiveSpeechSettings>) => {
		const next = { ...draft, ...patch };
		setDraft(next);
		props.onChange?.(next);
	};
	return (
		<section className="settings-field" data-testid="proactive-speech-settings">
			<label>
				{t("settings.proactiveProfile")}
				<select
					data-testid="proactive-speech-profile"
					value={draft.profile}
					onChange={(event) =>
						update({
							profile: event.target.value as ProactiveSpeechSettings["profile"],
						})
					}
				>
					<option value="disabled">{t("settings.proactiveDisabled")}</option>
					{props.mode !== "exhibition" && (
						<option value="personal_radio_dj">
							{t("settings.proactiveDj")}
						</option>
					)}
					{props.mode !== "dj" && (
						<option value="exhibition_intro">
							{t("settings.proactiveExhibition")}
						</option>
					)}
				</select>
			</label>
			<label>
				{t("settings.proactiveTimezone")}
				<input
					data-testid="proactive-timezone"
					value={draft.timezone}
					onChange={(event) => update({ timezone: event.target.value })}
				/>
			</label>
			<label>
				{t("settings.proactiveIdle")}
				<input
					data-testid="proactive-idle-ms"
					type="number"
					value={draft.idleMs ?? ""}
					onChange={(event) => update({ idleMs: Number(event.target.value) })}
				/>
			</label>
			<label>
				{t("settings.proactiveInterval")}
				<input
					data-testid="proactive-interval-ms"
					type="number"
					value={draft.intervalMs ?? ""}
					onChange={(event) =>
						update({ intervalMs: Number(event.target.value) })
					}
				/>
			</label>
			{props.mode !== "exhibition" && (
				<label>
					<input
						data-testid="proactive-bgm-autoplay"
						type="checkbox"
						checked={draft.bgmAutoPlay === true}
						onChange={(event) => update({ bgmAutoPlay: event.target.checked })}
					/>
					{t("settings.proactiveBgm")}
				</label>
			)}
			<label>
				<input
					data-testid="proactive-weather-consent"
					type="checkbox"
					checked={draft.weatherConsented === true}
					onChange={(event) =>
						update({
							weatherConsented: event.target.checked,
							...(!event.target.checked
								? {
										weatherLatitude: undefined,
										weatherLongitude: undefined,
									}
								: {}),
						})
					}
				/>
				{t("settings.proactiveWeather")}
			</label>
			<label>
				{t("settings.proactiveLatitude")}
				<input
					data-testid="proactive-weather-latitude"
					type="number"
					value={draft.weatherLatitude ?? ""}
					onChange={(event) =>
						update({ weatherLatitude: Number(event.target.value) })
					}
				/>
			</label>
			<label>
				{t("settings.proactiveLongitude")}
				<input
					data-testid="proactive-weather-longitude"
					type="number"
					value={draft.weatherLongitude ?? ""}
					onChange={(event) =>
						update({ weatherLongitude: Number(event.target.value) })
					}
				/>
			</label>
			{props.mode !== "dj" && (
				<label>
					{t("settings.proactiveScope")}
					<input
						data-testid="proactive-knowledge-scope"
						value={draft.knowledgeScope ?? ""}
						onChange={(event) => update({ knowledgeScope: event.target.value })}
					/>
				</label>
			)}
			<button
				type="button"
				data-testid="proactive-settings-save"
				onClick={async () => {
					setSaveFailed(false);
					let normalized = normalizeProactiveSpeechSettings(draft);
					const sourceIsOutsideThisSection =
						props.value.profile !== "disabled" &&
						scopeProfile(props.value, props.mode).profile === "disabled";
					if (sourceIsOutsideThisSection && draft.profile === "disabled") {
						normalized = { ...normalized, profile: props.value.profile };
					}
					const saved = await props.onSave(normalized);
					setSaveFailed(!saved);
				}}
			>
				{t("settings.proactiveSave")}
			</button>
			{saveFailed && (
				<div role="alert" data-testid="proactive-settings-save-error">
					{t("settings.proactiveSaveError")}
				</div>
			)}
		</section>
	);
}
