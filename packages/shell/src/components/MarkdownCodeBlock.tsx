import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { t } from "../lib/i18n";

type MermaidApi = typeof import("mermaid")["default"];

let mermaidPromise: Promise<MermaidApi> | undefined;

function loadMermaid(): Promise<MermaidApi> {
	mermaidPromise ??= import("mermaid").then(({ default: mermaid }) => {
		mermaid.initialize({
			startOnLoad: false,
			theme: "dark",
			securityLevel: "strict",
			htmlLabels: false,
			flowchart: { htmlLabels: false },
			sequence: { useHtmlLabels: false } as Record<string, unknown>,
		});
		return mermaid;
	});
	return mermaidPromise;
}

let mermaidIdCounter = 0;

export function highlightCode(code: string, language: string): string {
	const normalized = language.toLowerCase();
	const highlighted = hljs.getLanguage(normalized)
		? hljs.highlight(code, { language: normalized, ignoreIllegals: true }).value
		: hljs.highlight(code, { language: "plaintext" }).value;
	return DOMPurify.sanitize(highlighted, {
		ALLOWED_TAGS: ["span"],
		ALLOWED_ATTR: ["class"],
	});
}

/** Shared safe Mermaid renderer for chat and workspace Markdown. */
export function MermaidBlock({ code }: { code: string }) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!containerRef.current || !code.trim()) return;
		const id = `mermaid-${++mermaidIdCounter}`;
		let cancelled = false;
		void loadMermaid()
			.then((mermaid) => mermaid.render(id, code.trim()))
			.then(({ svg }) => {
				if (!cancelled && containerRef.current) {
					containerRef.current.innerHTML = DOMPurify.sanitize(svg, {
						USE_PROFILES: { svg: true, svgFilters: true },
					});
					setError(null);
				}
			})
			.catch((cause) => {
				if (!cancelled) setError(String(cause?.message ?? cause));
			});
		return () => {
			cancelled = true;
		};
	}, [code]);

	if (error) {
		return (
			<div className="markdown-mermaid-error" role="alert">
				<div>Mermaid 오류 — 원문을 표시합니다.</div>
				<pre>
					<code>{code}</code>
				</pre>
			</div>
		);
	}
	return <div ref={containerRef} className="workspace-editor__mermaid" />;
}

interface MarkdownCodeBlockProps {
	className?: string;
	children?: ReactNode;
	onOpenWorkspace?: (code: string, language: string) => void;
}

export function MarkdownCodeBlock({
	className,
	children,
	onOpenWorkspace,
}: MarkdownCodeBlockProps) {
	const [copied, setCopied] = useState(false);
	const language = /language-([\w-]+)/.exec(className ?? "")?.[1] ?? "text";
	const code = String(children).replace(/\n$/, "");
	if (language.toLowerCase() === "mermaid") return <MermaidBlock code={code} />;
	// react-markdown also calls this override for inline code.
	if (!className) return <code>{children}</code>;
	return (
		<details className="chat-code-block" open>
			<summary>
				<span className="chat-code-language">{language}</span>
			</summary>
			<div className="chat-code-actions">
				<button
					type="button"
					onClick={() => {
						void navigator.clipboard.writeText(code).then(() => {
							setCopied(true);
							window.setTimeout(() => setCopied(false), 1600);
						});
					}}
					aria-live="polite"
				>
					{copied ? t("chat.codeCopied") : t("chat.codeCopy")}
				</button>
				{onOpenWorkspace ? (
					<button type="button" onClick={() => onOpenWorkspace(code, language)}>
						워크스페이스에서 열기
					</button>
				) : null}
			</div>
			<pre>
				{/* DOMPurify restricts this highlighted fragment to span/class only. */}
				<code
					className={className}
					// biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized syntax-highlight markup
					dangerouslySetInnerHTML={{ __html: highlightCode(code, language) }}
				/>
			</pre>
		</details>
	);
}
