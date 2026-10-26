import { TFile } from "obsidian";
import { useContext, useEffect, useReducer, useState, useSyncExternalStore } from "react";
import { LegalRef } from "references/parser";
import { PluginContext } from "./context";
import { HISTORY_EVENT, REFERENCES_EVENT } from "main";
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

/** Délai d'attente après une frappe avant de réanalyser la note modifiée. */
const REPARSE_DELAY_MS = 800;

/**
 * Références juridiques de la note active. Se met à jour quand l'utilisateur
 * change de note, modifie la note, ou lorsqu'un lien est retrouvé via l'API.
 */
export const useNoteReferences = () => {
	const plugin = usePlugin();
	const { workspace, vault } = plugin.app;
	const [file, setFile] = useState<TFile | null>(() => workspace.getActiveFile());
	const [refs, setRefs] = useState<LegalRef[]>([]);
	/** Incrémenté pour relancer l'analyse après une modification de la note. */
	const [version, setVersion] = useState(0);
	const reparse = () => setVersion((v) => v + 1);
	/**
	 * Simple rafraîchissement de l'affichage quand un lien est retrouvé ou une recherche
	 * démarre. Ne doit PAS relancer l'analyse : celle-ci lance la recherche des liens, qui
	 * émet cet événement — d'où une boucle sans fin qui figeait Obsidian.
	 */
	const [, refresh] = useReducer((n: number) => n + 1, 0);

	useEffect(() => {
		const timer: { id?: number } = {};
		const refs = [
			workspace.on("file-open", (opened) => opened && setFile(opened)),
			vault.on("modify", (modified) => {
				if (modified !== file) return;
				window.clearTimeout(timer.id);
				timer.id = window.setTimeout(reparse, REPARSE_DELAY_MS);
			}),
		];
		const linkRef = plugin.events.on(REFERENCES_EVENT, refresh);
		return () => {
			window.clearTimeout(timer.id);
			refs.forEach((ref) => workspace.offref(ref));
			plugin.events.offref(linkRef);
		};
	}, [file]);

	useEffect(() => {
		let cancelled = false;
		if (!file || file.extension !== "md") {
			setRefs([]);
			return;
		}
		plugin.getReferences(file).then((found) => {
			if (cancelled) return;
			setRefs(found);
			if (plugin.settings.autoResolveRefs) plugin.resolveReferences(found);
		});
		return () => {
			cancelled = true;
		};
	}, [file, version]);

	return { file: file?.extension === "md" ? file : null, refs };
};
