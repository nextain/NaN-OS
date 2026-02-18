import { useCallback, useRef, useState } from "react";
import { AvatarCanvas } from "./AvatarCanvas";
import { ChatPanel } from "./ChatPanel";

const MIN_AVATAR_PERCENT = 20;
const MAX_AVATAR_PERCENT = 70;
const DEFAULT_AVATAR_PERCENT = 25;

export function SidePanel() {
	const [avatarPercent, setAvatarPercent] = useState(DEFAULT_AVATAR_PERCENT);
	const panelRef = useRef<HTMLDivElement>(null);
	const isDragging = useRef(false);

	const handleMouseDown = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		isDragging.current = true;

		const onMouseMove = (ev: MouseEvent) => {
			if (!isDragging.current || !panelRef.current) return;
			const rect = panelRef.current.getBoundingClientRect();
			const percent = ((ev.clientY - rect.top) / rect.height) * 100;
			setAvatarPercent(
				Math.min(MAX_AVATAR_PERCENT, Math.max(MIN_AVATAR_PERCENT, percent)),
			);
		};

		const onMouseUp = () => {
			isDragging.current = false;
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
		};

		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);
	}, []);

	return (
		<div className="side-panel" ref={panelRef}>
			<div
				className="side-panel-avatar"
				style={{ height: `${avatarPercent}%` }}
			>
				<AvatarCanvas />
			</div>

			{/* Resize handle */}
			<div className="side-panel-divider" onMouseDown={handleMouseDown} />

			<div
				className="side-panel-chat"
				style={{ height: `${100 - avatarPercent}%` }}
			>
				<ChatPanel />
			</div>
		</div>
	);
}
