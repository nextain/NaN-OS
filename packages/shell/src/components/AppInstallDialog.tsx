import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { getStoreGatewayUrl, hasStoreEntitlement, type AppInstallRequest } from "../lib/app-store-client";
import { loadInstalledApps } from "../lib/app-loader";
import { t } from "../lib/i18n";
import { useAppStore } from "../stores/app";

interface AppInstallDialogProps { request: AppInstallRequest; onClose(): void }
interface AppInstallResult { id: string; name: string; path: string }

export function AppInstallDialog({ request, onClose }: AppInstallDialogProps) {
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	const pushModal = useAppStore((s) => s.pushModal);
	const popModal = useAppStore((s) => s.popModal);

	useEffect(() => {
		pushModal();
		return () => popModal();
	}, [pushModal, popModal]);

	async function install() {
		setBusy(true);
		setMessage("");
		try {
			if (!(await hasStoreEntitlement(request.appId))) throw new Error(t("apps.loginRequired"));
			const result = await invoke<AppInstallResult>("app_install_store", {
				appId: request.appId,
				gatewayUrl: getStoreGatewayUrl(),
			});
			await loadInstalledApps();
			setMessage(t("apps.installed").replace("{name}", result.name));
		} catch (error) { setMessage(String(error)); }
		finally { setBusy(false); }
	}

	return <div className="panel-install-overlay" onClick={onClose} onKeyDown={() => {}}>
		<div className="panel-install-dialog" onClick={(e) => e.stopPropagation()} onKeyDown={() => {}}>
			<div className="panel-install-header"><span className="panel-install-title">Naia Apps</span><button type="button" className="panel-install-close" onClick={onClose}>✕</button></div>
			<div className="panel-install-body">
				<div className="panel-install-result">
					<strong>{request.name || request.appId}</strong>
					<p>{t("apps.defaultDescription")}</p>
					<button type="button" className="panel-install-confirm-btn" disabled={busy} onClick={() => void install()}>{busy ? t("apps.installing") : t("apps.install").replace("{credits}", "")}</button>
				</div>
				{message && <div className="panel-install-result">{message}</div>}
			</div>
			<div className="panel-install-footer"><span className="panel-install-hint">{t("apps.purchasePersists")}</span><button type="button" className="panel-install-cancel-btn" onClick={onClose}>{t("apps.close")}</button></div>
		</div>
	</div>;
}
