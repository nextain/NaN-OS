import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { getStoreGatewayUrl, hasStoreEntitlement, listStoreProducts, purchaseStoreApp, type StoreProduct } from "../lib/app-store-client";
import { loadInstalledApps } from "../lib/app-loader";
import { t } from "../lib/i18n";
import { useAppStore } from "../stores/app";

interface AppInstallDialogProps { onClose(): void }
interface AppInstallResult { id: string; name: string; path: string }

export function AppInstallDialog({ onClose }: AppInstallDialogProps) {
	const [products, setProducts] = useState<StoreProduct[]>([]);
	const [busy, setBusy] = useState<string | null>(null);
	const [message, setMessage] = useState(t("apps.loading"));
	const pushModal = useAppStore((s) => s.pushModal);
	const popModal = useAppStore((s) => s.popModal);

	useEffect(() => {
		pushModal();
		void listStoreProducts().then((data) => {
			setProducts(data);
			setMessage(data.length ? "" : t("apps.empty"));
		}).catch((error) => setMessage(String(error)));
		return () => popModal();
	}, [pushModal, popModal]);

	async function install(product: StoreProduct) {
		setBusy(product.app_id);
		setMessage("");
		try {
			if (!(await hasStoreEntitlement(product.app_id))) await purchaseStoreApp(product.app_id);
			if (!(await hasStoreEntitlement(product.app_id))) throw new Error(t("apps.loginRequired"));
			const result = await invoke<AppInstallResult>("app_install_store", {
				appId: product.app_id,
				gatewayUrl: getStoreGatewayUrl(),
			});
			await loadInstalledApps();
			setMessage(t("apps.installed").replace("{name}", result.name));
		} catch (error) { setMessage(String(error)); }
		finally { setBusy(null); }
	}

	return <div className="panel-install-overlay" onClick={onClose} onKeyDown={() => {}}>
		<div className="panel-install-dialog" onClick={(e) => e.stopPropagation()} onKeyDown={() => {}}>
			<div className="panel-install-header"><span className="panel-install-title">Naia Apps</span><button type="button" className="panel-install-close" onClick={onClose}>✕</button></div>
			<div className="panel-install-body">
				{products.map((product) => <div className="panel-install-result" key={product.id}>
					<strong>{product.manifest.name || product.app_id}</strong> <small>v{product.version}</small>
					<p>{product.manifest.description || t("apps.defaultDescription")}</p>
					<button type="button" className="panel-install-confirm-btn" disabled={busy !== null} onClick={() => void install(product)}>{busy === product.app_id ? t("apps.installing") : t("apps.install").replace("{credits}", String(product.price_credits))}</button>
				</div>)}
				{message && <div className="panel-install-result">{message}</div>}
			</div>
			<div className="panel-install-footer"><span className="panel-install-hint">{t("apps.purchasePersists")}</span><button type="button" className="panel-install-cancel-btn" onClick={onClose}>{t("apps.close")}</button></div>
		</div>
	</div>;
}
