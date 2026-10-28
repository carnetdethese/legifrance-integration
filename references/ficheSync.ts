/**
 * Complément d'une fiche de décision depuis les bases publiques : la décision est lue par sa clef
 * (identifiant Légifrance ou adresse ArianeWeb), retrouvée par une recherche si la fiche n'en a pas,
 * puis les propriétés de la fiche sont renseignées (voir `fiches.ts`).
 */
import { Notice, TFile } from "obsidian";
import { ApiError } from "api/client";
import type LegifrancePlugin from "main";
import { pickCandidate } from "views/CandidateModal";
import { decisionTextId } from "./ids";
import { DecisionValues, Frontmatter, completableCount, ficheId, ficheQuery, ficheUpdates } from "./fiches";
import type { Task } from "./indexer";
import { DecisionCandidate, findCandidates, valuesFor } from "./sources";

/**
 * Retrouve la décision d'une fiche sans identifiant : une seule décision trouvée est retenue, plusieurs
 * sont soumises à l'utilisateur.
 */
async function identifyDecision(plugin: LegifrancePlugin, frontmatter: Frontmatter): Promise<DecisionCandidate | null> {
	const { settings } = plugin;
	const query = ficheQuery(frontmatter, settings);
	if (!query.number && !query.name) {
		new Notice(
			`Aucun identifiant Légifrance, ni numéro (« ${settings.ficheNumberProperty} »), ni nom (« ${settings.ficheNameProperty} ») pour chercher la décision. Renseignez l'un d'eux, ou un lien Légifrance.`,
			8000
		);
		return null;
	}

	const notice = new Notice("Recherche de la décision…", 0);
	let outcome;
	try {
		outcome = await findCandidates(plugin, query);
	} finally {
		notice.hide();
	}

	if (outcome.candidates.length === 0) {
		const details = [...outcome.errors, ...outcome.skipped];
		new Notice(`Aucune décision trouvée${details.length ? ` (${details.join(" ; ")})` : ""}.`, 8000);
		return null;
	}
	if (outcome.candidates.length === 1) return outcome.candidates[0];
	return pickCandidate(plugin.app, outcome.candidates);
}

/**
 * Complète les propriétés de la fiche. N'écrit que les propriétés vides (toutes si le réglage
 * « remplacer » est actif) et conserve la clef de la décision dans sa propriété.
 * @param silent complément automatique : ne cherche pas de décision et n'annonce rien d'inutile.
 */
export async function completeFiche(plugin: LegifrancePlugin, file: TFile, silent = false) {
	const { settings } = plugin;
	const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
	let key = ficheId(frontmatter, settings);
	let values: DecisionValues | undefined;
	let chosen: DecisionCandidate | null = null;

	if (!key) {
		if (silent) return;
		chosen = await identifyDecision(plugin, frontmatter);
		if (!chosen) return;
		key = chosen.key;
		values = chosen.values;
	} else if (completableCount(frontmatter, settings) === 0 && !settings.ficheOverwrite) {
		if (!silent) new Notice("Cette fiche est déjà complète.");
		return;
	}

	try {
		values ??= await valuesFor(plugin, key);
		// Rien à changer : on n'ouvre pas le fichier en écriture (Obsidian reformate l'en-tête à chaque écriture).
		if (Object.keys(ficheUpdates(frontmatter, settings, values, key)).length === 0) {
			if (chosen) new Notice(`Décision retrouvée : ${chosen.title}`);
			else if (!silent) new Notice("Aucune information nouvelle pour cette fiche.");
			return;
		}
		let written: string[] = [];
		await plugin.app.fileManager.processFrontMatter(file, (front) => {
			const updates = ficheUpdates(front, settings, values!, key!);
			Object.assign(front, updates);
			written = Object.keys(updates);
		});
		if (chosen) new Notice(`Fiche liée à : ${chosen.title}${written.length ? ` (${written.join(", ")})` : ""}.`, 8000);
		else if (!silent || written.length > 0) {
			new Notice(written.length > 0 ? `Fiche complétée : ${written.join(", ")}.` : "Aucune information nouvelle pour cette fiche.");
		}
	} catch (error) {
		console.error(error);
		new Notice(`Fiche non complétée : ${error instanceof Error ? error.message : String(error)}`, 8000);
	}
}

// --- Complément de toutes les fiches du coffre ---------------------------------------------------

/** Bilan du complément en lot. */
export interface BatchReport {
	completed: number;
	/** Rien à compléter. */
	already: number;
	/** Sans identifiant, et recherche non demandée. */
	noId: number;
	/** Recherche sans résultat. */
	notFound: number;
	/** Plusieurs décisions possibles : laissées à un choix manuel (bouton de la fiche). */
	ambiguous: number;
	errors: number;
	/** Parmi les fiches à compléter, celles dont la décision est déjà en base (aucune requête). */
	local?: number;
	stopped?: string;
}

/**
 * Complète les propriétés de chaque fiche du coffre qui a un identifiant (sauf celles déjà complètes,
 * qui ne coûtent aucune requête). Avec le réglage « inclure les fiches sans identifiant », cherche
 * aussi leur décision, mais ne retient que les résultats sans ambiguïté : s'il y a plusieurs choix, la
 * fiche est laissée à l'utilisateur. Reprenable : une fiche complétée n'est pas retraitée.
 */
export async function completeAllFiches(plugin: LegifrancePlugin, progress: (done: number, total: number, label: string) => void): Promise<BatchReport> {
	const { settings } = plugin;
	const report: BatchReport = { completed: 0, already: 0, noId: 0, notFound: 0, ambiguous: 0, errors: 0 };
	const files = plugin.references.fichePaths().map((path) => plugin.app.vault.getFileByPath(path)).filter((f): f is TFile => !!f);

	for (const [i, file] of files.entries()) {
		if (plugin.tasks.cancelled) return { ...report, stopped: "arrêtée" };
		progress(i, files.length, file.path);
		const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
		try {
			let key = ficheId(frontmatter, settings);
			let values: DecisionValues | undefined;

			if (!key) {
				if (!settings.ficheBatchSearch) {
					report.noId++;
					continue;
				}
				const query = ficheQuery(frontmatter, settings);
				if (!query.number && !query.name) {
					report.noId++;
					continue;
				}
				// Recherche déjà infructueuse pour ces mêmes éléments : pas de nouvelle requête (modifier la
				// fiche, ou le mode de recherche, la relance).
				const missKey = `fiche:${file.path}|${settings.ficheSearch}|${query.court ?? ""}|${query.number ?? ""}|${query.name ?? ""}|${query.date ?? ""}`;
				if (plugin.references.hasMiss(missKey)) {
					report.notFound++;
					continue;
				}
				const { candidates, errors } = await findCandidates(plugin, query, "background");
				if (candidates.length === 0) {
					if (errors.length) throw new Error(errors.join(" ; "));
					plugin.references.setMissKey(missKey);
					report.notFound++;
					continue;
				}
				if (candidates.length > 1) {
					report.ambiguous++;
					continue;
				}
				key = candidates[0].key;
				values = candidates[0].values;
			} else if (completableCount(frontmatter, settings) === 0 && !settings.ficheOverwrite) {
				report.already++;
				continue;
			}

			values ??= await valuesFor(plugin, key, "background");
			// Rien à changer : le fichier n'est pas ouvert en écriture.
			if (Object.keys(ficheUpdates(frontmatter, settings, values, key)).length === 0) {
				report.already++;
				continue;
			}
			await plugin.app.fileManager.processFrontMatter(file, (front) => Object.assign(front, ficheUpdates(front, settings, values!, key!)));
			report.completed++;
		} catch (error) {
			// Identifiants refusés ou quota dépassé : inutile d'insister.
			if (error instanceof ApiError && [401, 403, 429].includes(error.status ?? 0)) return { ...report, stopped: error.message };
			console.error(file.path, error);
			report.errors++;
		}
	}
	return report;
}

export const COMPLETE_FICHES_TASK: Task<BatchReport> = {
	name: "Compléter les fiches",
	run: completeAllFiches,
	summarize: (r) =>
		`${r.stopped ? `interrompu (${r.stopped}) — ` : ""}${r.completed} complétées, ${r.already} déjà complètes, ${r.noId} sans identifiant, ${r.ambiguous} à choisir à la main, ${r.notFound} introuvables, ${r.errors} erreurs.`,
};

/**
 * Simulation du complément en lot : compte, sans aucune requête ni écriture, les fiches qui seraient
 * modifiées, déjà complètes ou sans identifiant.
 */
export async function simulateCompleteFiches(plugin: LegifrancePlugin, progress: (done: number, total: number, label: string) => void): Promise<BatchReport> {
	const { settings } = plugin;
	const report: BatchReport = { completed: 0, already: 0, noId: 0, notFound: 0, ambiguous: 0, errors: 0 };
	const files = plugin.references.fichePaths().map((path) => plugin.app.vault.getFileByPath(path)).filter((f): f is TFile => !!f);
	for (const [i, file] of files.entries()) {
		if (plugin.tasks.cancelled) return { ...report, stopped: "arrêtée" };
		if (i % 50 === 0) progress(i, files.length, file.path);
		const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!ficheId(frontmatter, settings)) report.noId++;
		else if (completableCount(frontmatter, settings) === 0 && !settings.ficheOverwrite) report.already++;
		else {
			report.completed++;
			const key = ficheId(frontmatter, settings)!;
			if (decisionTextId(key) && plugin.references.completeDecision(key)) report.local = (report.local ?? 0) + 1;
		}
	}
	return report;
}

export const SIMULATE_FICHES_TASK: Task<BatchReport> = {
	name: "Simulation du complément des fiches",
	run: simulateCompleteFiches,
	summarize: (r) => `${r.completed} fiches seraient complétées (${r.local ?? 0} depuis la base, ${r.completed - (r.local ?? 0)} avec une requête à l'API), ${r.already} sont déjà complètes, ${r.noId} n'ont pas d'identifiant. Simulation : aucune requête, aucune écriture.`,
};
