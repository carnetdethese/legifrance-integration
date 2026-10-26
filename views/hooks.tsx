import { useContext, useSyncExternalStore } from "react";
import { PluginContext } from "./context";
import { HISTORY_EVENT } from "main";
import { documentDataStorage } from "./viewsData";

export const usePlugin = () => {
	const plugin = useContext(PluginContext);
	if (!plugin) {
		throw new Error("usePlugin doit être utilisé sous un PluginContext.Provider");
	}
	return plugin;
};

/**
 * Historique des documents consultés, mis à jour dès que le plugin le modifie
 * (ajout, suppression) depuis n'importe quelle vue.
 */
export const useHistorique = (): documentDataStorage[] => {
	const plugin = usePlugin();
	return useSyncExternalStore(
		(onChange) => {
			const ref = plugin.events.on(HISTORY_EVENT, onChange);
			return () => plugin.events.offref(ref);
		},
		() => plugin.historiqueDocuments
	);
};
