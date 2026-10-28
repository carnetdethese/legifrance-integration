/**
 * Recherche de la décision d'une fiche sans identifiant : numéro et/ou informations de la fiche,
 * dans chaque source disponible, dans l'ordre. On s'arrête à la première recherche qui donne des
 * résultats ; ArianeWeb ne passe donc qu'après Légifrance.
 */
import type LegifrancePlugin from "main";
import { ApiError } from "api/client";
import type { Lane } from "api/rateLimiter";
import { CC_SITE, RGD_SITE, decisionTextId } from "../ids";
import { DecisionQuery, DecisionValues, ccValues } from "../fiches";
import { ariaSource } from "./arianeweb";
import { rgdSource } from "./rgd";
import { legifranceSource, storedValues } from "./legifrance";
import { DecisionCandidate, DecisionSource } from "./types";

export type { DecisionCandidate, DecisionSource } from "./types";

/** Sources interrogées, dans l'ordre de préférence. Judilibre et le droit de l'Union s'ajouteront ici. */
export const SOURCES: DecisionSource[] = [legifranceSource, ariaSource, rgdSource];

export interface SearchOutcome {
	candidates: DecisionCandidate[];
	/** Erreurs rencontrées (identifiants refusés, service injoignable), pour expliquer l'absence de résultat. */
	errors: string[];
	/** Recherches impossibles faute d'identifiants PISTE. */
	skipped: string[];
}

/** @param search façon de chercher, à défaut celle des réglages */
export async function findCandidates(plugin: LegifrancePlugin, query: DecisionQuery, lane?: Lane, search?: "number" | "info" | "both"): Promise<SearchOutcome> {
	const ficheSearch = search ?? plugin.settings.ficheSearch;
	const modes = [
		...(ficheSearch !== "info" && query.number ? (["byNumber"] as const) : []),
		...(ficheSearch !== "number" && query.name ? (["byInfo"] as const) : []),
	];
	const outcome: SearchOutcome = { candidates: [], errors: [], skipped: [] };

	for (const mode of modes) {
		for (const source of SOURCES) {
			if (!source[mode]) continue;
			if (!source.available(plugin, query)) {
				if (source === legifranceSource && !plugin.hasCredentials) outcome.skipped.push("Légifrance (identifiants PISTE absents)");
				continue;
			}
			try {
				const found = await source[mode]!(plugin, query, lane);
				if (found.length) return { ...outcome, candidates: found };
			} catch (error) {
				const quota = error instanceof ApiError && [401, 403, 429].includes(error.status ?? 0);
				outcome.errors.push(`${source.label} : ${quota ? "accès refusé ou quota dépassé" : error instanceof Error ? error.message : String(error)}`);
			}
		}
	}
	return outcome;
}

/** Valeurs de la décision `key`, lues par la source qui la connaît. */
export async function valuesFor(plugin: LegifrancePlugin, key: string, lane?: Lane): Promise<DecisionValues> {
	// D'abord la base : une décision déjà complétée n'est pas redemandée à l'API (ni besoin d'identifiants).
	const stored = decisionTextId(key) ? storedValues(plugin, key) : undefined;
	if (stored) return stored;
	// Décision du Conseil constitutionnel connue par le Journal officiel ou son site : rien de plus à lire.
	if (key.startsWith("JORFTEXT") || key.startsWith(CC_SITE)) return ccValues(key);
	if (key.startsWith(RGD_SITE)) return rgdSource.values(plugin, key, lane);
	const source = decisionTextId(key) ? legifranceSource : ariaSource;
	if (source === legifranceSource && !plugin.hasCredentials) throw new Error("Identifiants PISTE absents (réglages du plugin).");
	return source.values(plugin, key, lane);
}
