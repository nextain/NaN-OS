import { getLocale } from "../../lib/i18n";

export type FileTreeTextKey =
	| "activeSession"
	| "copyRelative"
	| "copyAbsolute"
	| "sendToNaia"
	| "loading"
	| "sectionProject"
	| "sectionWorktree"
	| "sectionReference"
	| "sectionDocs"
	| "sectionOther"
	| "noClassifiedDirs"
	| "empty";

const ko: Record<FileTreeTextKey, string> = {
	activeSession: "활성 세션",
	copyRelative: "상대 경로 복사",
	copyAbsolute: "절대 경로 복사",
	sendToNaia: "Naia에게 보내기",
	loading: "불러오는 중…",
	sectionProject: "🏗 프로젝트",
	sectionWorktree: "🌿 워크트리",
	sectionReference: "📚 참조",
	sectionDocs: "📝 문서",
	sectionOther: "📁 기타",
	noClassifiedDirs: "분류된 디렉토리를 찾을 수 없습니다",
	empty: "표시할 파일이나 폴더가 없습니다",
};

const en: Record<FileTreeTextKey, string> = {
	activeSession: "Active session",
	copyRelative: "Copy relative path",
	copyAbsolute: "Copy absolute path",
	sendToNaia: "Send to Naia",
	loading: "Loading…",
	sectionProject: "🏗 Projects",
	sectionWorktree: "🌿 Worktrees",
	sectionReference: "📚 References",
	sectionDocs: "📝 Documents",
	sectionOther: "📁 Other",
	noClassifiedDirs: "No classified directories found",
	empty: "No files or folders to display",
};

export function fileTreeText(key: FileTreeTextKey): string {
	return (getLocale() === "ko" ? ko : en)[key];
}
