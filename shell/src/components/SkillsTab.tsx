import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import {
	getDisabledSkills,
	isSkillDisabled,
	loadConfig,
	saveConfig,
	toggleSkill,
} from "../lib/config";
import { t } from "../lib/i18n";
import { Logger } from "../lib/logger";
import type { SkillManifestInfo } from "../lib/types";
import { useSkillsStore } from "../stores/skills";

function tierLabel(tier: number): string {
	return `T${tier}`;
}

export function SkillsTab() {
	const skills = useSkillsStore((s) => s.skills);
	const isLoading = useSkillsStore((s) => s.isLoading);
	const searchQuery = useSkillsStore((s) => s.searchQuery);
	useSkillsStore((s) => s.configVersion);

	useEffect(() => {
		loadSkills();
	}, []);

	async function loadSkills() {
		const store = useSkillsStore.getState();
		store.setLoading(true);
		try {
			const result = await invoke<SkillManifestInfo[]>("list_skills");
			store.setSkills(result);
		} catch (err) {
			Logger.warn("SkillsTab", "Failed to load skills", {
				error: String(err),
			});
		} finally {
			store.setLoading(false);
		}
	}

	function handleToggle(skillName: string) {
		toggleSkill(skillName);
		useSkillsStore.getState().bumpConfigVersion();
	}

	function handleEnableAll() {
		const config = loadConfig();
		if (!config) return;
		saveConfig({ ...config, disabledSkills: [] });
		useSkillsStore.getState().bumpConfigVersion();
	}

	function handleDisableAll() {
		const config = loadConfig();
		if (!config) return;
		const customNames = skills
			.filter((s) => s.type !== "built-in")
			.map((s) => s.name);
		saveConfig({ ...config, disabledSkills: customNames });
		useSkillsStore.getState().bumpConfigVersion();
	}

	const query = searchQuery.toLowerCase();
	const filtered = query
		? skills.filter(
				(s) =>
					s.name.toLowerCase().includes(query) ||
					s.description.toLowerCase().includes(query),
			)
		: skills;

	const builtInSkills = filtered.filter((s) => s.type === "built-in");
	const customSkills = filtered.filter((s) => s.type !== "built-in");

	const disabledSkills = getDisabledSkills();
	const enabledCount = skills.filter(
		(s) => !disabledSkills.includes(s.name),
	).length;

	if (isLoading) {
		return (
			<div className="skills-tab">
				<div className="skills-loading">{t("skills.loading")}</div>
			</div>
		);
	}

	if (skills.length === 0) {
		return (
			<div className="skills-tab">
				<div className="skills-empty">{t("skills.empty")}</div>
			</div>
		);
	}

	return (
		<div className="skills-tab">
			{/* Header */}
			<div className="skills-header">
				<input
					type="text"
					className="skills-search"
					placeholder={t("skills.search")}
					value={searchQuery}
					onChange={(e) =>
						useSkillsStore.getState().setSearchQuery(e.target.value)
					}
				/>
				<div className="skills-header-actions">
					<span className="skills-count">
						{enabledCount}/{skills.length}
					</span>
					<button
						type="button"
						className="skills-action-btn"
						onClick={handleEnableAll}
					>
						{t("skills.enableAll")}
					</button>
					<button
						type="button"
						className="skills-action-btn"
						onClick={handleDisableAll}
					>
						{t("skills.disableAll")}
					</button>
				</div>
			</div>

			{/* Skill list */}
			<div className="skills-list">
				{builtInSkills.length > 0 && (
					<>
						<div className="skills-section-title">
							{t("skills.builtInSection")} ({builtInSkills.length})
						</div>
						{builtInSkills.map((skill) => (
							<SkillCard
								key={skill.name}
								skill={skill}
								disabled={false}
								onToggle={handleToggle}
							/>
						))}
					</>
				)}

				{customSkills.length > 0 && (
					<>
						<div className="skills-section-title">
							{t("skills.customSection")} ({customSkills.length})
						</div>
						{customSkills.map((skill) => (
							<SkillCard
								key={skill.name}
								skill={skill}
								disabled={isSkillDisabled(skill.name)}
								onToggle={handleToggle}
							/>
						))}
					</>
				)}
			</div>
		</div>
	);
}

function SkillCard({
	skill,
	disabled,
	onToggle,
}: {
	skill: SkillManifestInfo;
	disabled: boolean;
	onToggle: (name: string) => void;
}) {
	const isBuiltIn = skill.type === "built-in";

	return (
		<div className={`skill-card${disabled ? " disabled" : ""}`}>
			<div className="skill-card-info">
				<div className="skill-card-name">{skill.name}</div>
				<div className="skill-card-desc">{skill.description}</div>
				<div className="skill-card-badges">
					{isBuiltIn && (
						<span className="skill-badge built-in">{t("skills.builtIn")}</span>
					)}
					{!isBuiltIn && (
						<span className={`skill-badge ${skill.type}`}>
							{skill.type === "gateway"
								? t("skills.gateway")
								: t("skills.command")}
						</span>
					)}
					<span className="skill-badge tier">{tierLabel(skill.tier)}</span>
				</div>
			</div>
			{!isBuiltIn && (
				<label className="skill-toggle">
					<input
						type="checkbox"
						checked={!disabled}
						onChange={() => onToggle(skill.name)}
					/>
				</label>
			)}
		</div>
	);
}
