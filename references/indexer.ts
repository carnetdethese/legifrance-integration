/**
 * Travaux de fond sur la base : indexation de toutes les notes du coffre, puis complément des
 * fiches de décisions via l'API. Chaque tâche rend la main à l'interface régulièrement et signale
 * sa progression.
 */
import { ApiError } from "api/client";
import type LegifrancePlugin from "main";
import { decisionTextId, readDecision } from "./caselaw";
import { canResolve } from "./resolver";

/** Reçoit (traités, total, libellé) au fil de la tâche. */
export type Progress = (done: number, total: number, label: string) => void;

/** Notes traitées avant de rendre la main à l'interface. */
const NOTES_PER_BATCH = 25;
/** Pause entre deux requêtes à l'API (ms), pour ne pas dépasser le quota. */
const API_PAUSE_MS = 250;

const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Résultat de l'indexation du coffre. */
export interface IndexReport {
	notes: number;
	analyzed: number;
	removed: number;
	references: number;
}

/**
 * Analyse toutes les notes du coffre (celles qui n'ont pas changé depuis leur dernière analyse sont
 * ignorées), retire de la base les notes disparues et les références devenues orphelines.
 */
export async function indexVault(plugin: LegifrancePlugin, progress: Progress): Promise<IndexReport> {
	const files = plugin.app.vault.getMarkdownFiles();
	const index = plugin.references;
	let analyzed = 0;

	for (const [i, file] of files.entries()) {
		if (!index.cached(file.path, file.stat.mtime)) {
			await plugin.getReferences(file);
			analyzed++;
		}
		if (i % NOTES_PER_BATCH === 0) {
			progress(i, files.length, file.path);
			await pause(0);
		}
	}

	// Notes supprimées ou déplacées hors de l'application pendant qu'elle était fermée.
	const present = new Set(files.map((f) => f.path));
	const missing = index.db.all<{ path: string }>("SELECT path FROM notes").filter((n) => !present.has(n.path));
	missing.forEach((n) => index.remove(n.path));

	index.prune();
	return { notes: files.length, analyzed, removed: missing.length, references: index.stats().references };
}

/** Résultat du complément des fiches. */
export interface EnrichReport {
	complete: number;
	external: number;
	unresolved: number;
	errors: number;
	/** Interrompu (quota dépassé, identifiants refusés). */
	stopped?: string;
}

/**
 * Complète la fiche de chaque décision citée : retrouve son adresse Légifrance si besoin, puis lit
 * ses métadonnées et son texte (`/consult/juri`). Les décisions hors Légifrance (ArianeWeb) sont
 * notées « external », sans texte. Reprenable : seules les fiches à compléter ou à retenter sont
 * traitées.
 */
export async function enrichDecisions(plugin: LegifrancePlugin, progress: Progress): Promise<EnrichReport> {
	const index = plugin.references;
	const report: EnrichReport = { complete: 0, external: 0, unresolved: 0, errors: 0 };
	if (!plugin.hasCredentials) return { ...report, stopped: "Identifiants PISTE absents." };

	index.ensureDecisionRows();
	const todo = index.pendingDecisions();

	for (const [i, ref] of todo.entries()) {
		progress(i, todo.length, ref.label);
		try {
			// 1. Adresse de la décision (recherche si elle n'est pas encore connue).
			if (!index.linkFor(ref) && canResolve(ref)) await plugin.resolveReferences([ref], true);
			const link = index.linkFor(ref);
			if (!link) {
				index.saveDecision(ref.key, { status: "unresolved" });
				report.unresolved++;
				continue;
			}

			// 2. Fiche : métadonnées et texte, lus sur Légifrance (pas pour une page ArianeWeb).
			const textId = decisionTextId(link.url);
			if (!textId) {
				index.saveDecision(ref.key, { status: "external", title: link.titre });
				report.external++;
				continue;
			}
			const response = await plugin.agent.dilaApi.fetch({ path: "/consult/juri", params: { textId } });
			const decision = readDecision(response);
			if (!decision) {
				index.saveDecision(ref.key, { status: "error", legifranceId: textId, error: "Réponse sans texte." });
				report.errors++;
			} else {
				index.saveDecision(ref.key, {
					status: "complete",
					legifranceId: textId,
					court: decision.court ?? ref.data.court,
					number: decision.number ?? ref.data.number,
					title: decision.title,
					date: decision.date,
					formation: decision.formation,
					ecli: decision.ecli,
					solution: decision.solution,
					html: decision.html,
					markdown: decision.markdown,
				});
				report.complete++;
			}
			await pause(API_PAUSE_MS);
		} catch (error) {
			// Identifiants refusés ou quota dépassé : inutile d'insister.
			if (error instanceof ApiError && [401, 403, 429].includes(error.status ?? 0)) {
				return { ...report, stopped: error.message };
			}
			index.saveDecision(ref.key, { status: "error", error: error instanceof Error ? error.message : String(error) });
			report.errors++;
		}
	}
	return report;
}

/** Tâche longue lançable depuis une commande ou les réglages (`LegifrancePlugin.runTask`). */
export interface Task<R> {
	name: string;
	run: (plugin: LegifrancePlugin, progress: Progress) => Promise<R>;
	/** Phrase de bilan affichée à la fin. */
	summarize: (report: R) => string;
}

export const INDEX_TASK: Task<IndexReport> = {
	name: "Indexation du coffre",
	run: indexVault,
	summarize: (r) => `${r.notes} notes (${r.analyzed} analysées), ${r.references} références.`,
};

export const ENRICH_TASK: Task<EnrichReport> = {
	name: "Fiches de décisions",
	run: enrichDecisions,
	summarize: (r) =>
		r.stopped
			? `interrompu : ${r.stopped}`
			: `${r.complete} complètes, ${r.external} hors Légifrance, ${r.unresolved} introuvables, ${r.errors} erreurs.`,
};
