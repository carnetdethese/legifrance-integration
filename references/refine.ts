/**
 * Décision introuvable précisée par l'utilisateur : nouvelle recherche avec les informations qu'il
 * donne (ou son lien direct), puis fiche complétée si la décision est retrouvée.
 */
import { Notice } from "obsidian";
import { ID_PATHS, LEGIFRANCE_URL } from "api/urls";
import type LegifrancePlugin from "main";
import { pickCandidate } from "views/CandidateModal";
import { refineDecision } from "views/RefineModal";
import type { CourtCode } from "./fiches";
import { decisionKey } from "./ids";
import { enrichDecisions } from "./indexer";
import { LegalRef } from "./parser";
import { DecisionCandidate, findCandidates } from "./sources";

/** Date saisie (JJ/MM/AAAA ou AAAA-MM-JJ) au format AAAA-MM-JJ, sinon `undefined`. */
export function isoOf(text: string) {
	const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
	if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
	const fr = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
	return fr ? `${fr[3]}-${fr[2].padStart(2, "0")}-${fr[1].padStart(2, "0")}` : undefined;
}

/** Page d'une décision d'après sa clef (identifiant Légifrance ou adresse ArianeWeb). */
const urlOf = (key: string) => (key.startsWith("http") ? key : `${LEGIFRANCE_URL}/${ID_PATHS[key.slice(0, 8)] ?? "juri/id"}/${key}`);

/**
 * Demande à l'utilisateur ce qu'il sait de la décision, la cherche, enregistre le lien trouvé et
 * complète sa fiche.
 * @returns `true` si la décision a été retrouvée.
 */
export async function refineUnresolved(plugin: LegifrancePlugin, ref: LegalRef): Promise<boolean> {
	const input = await refineDecision(plugin.app, ref.label, {
		court: ref.data.court as CourtCode | undefined,
		name: ref.data.name ?? "",
		date: ref.data.decided ?? "",
		number: ref.data.number ?? "",
	});
	if (!input) return false;

	let chosen: DecisionCandidate | null = null;
	const key = input.link.trim() ? decisionKey(input.link) : undefined;
	if (input.link.trim() && !key) {
		new Notice("Lien non reconnu : attendu une page Légifrance ou ArianeWeb, ou un identifiant (CETATEXT…, JURITEXT…).", 8000);
		return false;
	}
	if (key) {
		chosen = { source: key.startsWith("http") ? "arianeweb" : "legifrance", key, title: ref.label, url: urlOf(key) };
	} else {
		if (!input.number.trim() && !input.name.trim()) {
			new Notice("Indiquez au moins un nom ou un numéro.");
			return false;
		}
		const notice = new Notice("Recherche de la décision…", 0);
		let outcome;
		try {
			outcome = await findCandidates(plugin, { court: input.court, number: input.number.trim() || undefined, name: input.name.trim() || undefined, date: isoOf(input.date) }, "interactive", "both");
		} finally {
			notice.hide();
		}
		if (outcome.candidates.length === 0) {
			const details = [...outcome.errors, ...outcome.skipped];
			new Notice(`Toujours introuvable${details.length ? ` (${details.join(" ; ")})` : ""}.`, 8000);
			return false;
		}
		chosen = outcome.candidates.length === 1 ? outcome.candidates[0] : await pickCandidate(plugin.app, outcome.candidates);
		if (!chosen) return false;
	}

	plugin.references.setLink(ref, { url: chosen.url, titre: chosen.title });
	plugin.references.saveDecision(ref.key, { status: "pending" });
	const report = await enrichDecisions(plugin, () => undefined, { retryUnresolved: true, only: [ref] });
	new Notice(report.stopped ? `Lien enregistré, fiche à compléter plus tard (${report.stopped}).` : `Décision retrouvée : ${chosen.title}`, 6000);
	return true;
}
