import { TAB_SKILL_DESCRIPTORS } from "../../lib/tab-skills";

/** Store-package metadata. The app is registered only after signed installation. */
export const NAIA_SLIDES_DESCRIPTOR = {
	id: "land.naia.slides",
	name: "슬라이드",
	names: { ko: "슬라이드", en: "Slides" },
	icon: "▣",
	tools: [
		{
			name: "skill_slide_presenter",
			description:
				"Control the active Slides app. When the user asks to present, call start. Use question before answering a presentation question so automatic advance pauses. Answer from the active slide/deck context plus Naia's existing knowledge, then call resume only when the user asks to continue. Actions: start, pause, resume, stop, next, previous, goto, question, status, get_context.",
			parameters: {
				type: "object",
				properties: {
					action: {
						type: "string",
						enum: [
							"start",
							"pause",
							"resume",
							"stop",
							"next",
							"previous",
							"goto",
							"question",
							"status",
							"get_context",
						],
					},
					page: {
						type: "number",
						description: "1-based slide number for goto",
					},
				},
				required: ["action"],
			},
			tier: 0,
		},
		...TAB_SKILL_DESCRIPTORS,
	],
};
