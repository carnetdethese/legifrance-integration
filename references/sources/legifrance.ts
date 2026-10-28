/** Légifrance (API PISTE) : décisions du Conseil d'État, de la Cour de cassation et du Conseil constitutionnel. */
import type LegifrancePlugin from "main";
import { codeJuridiction } from "abstracts/decisions";
import { ApiError } from "api/client";
import type { Lane } from "api/rateLimiter";
import { legifranceUrl } from "api/urls";
import { removeTags } from "lib/tools";
import { readDecision } from "../caselaw";
import { findCcSiteDecision } from "../conseilConstitutionnel";
import { matchesDate, titleDates } from "../dates";
import { CourtCode, DecisionQuery, DecisionValues, ccValues } from "../fiches";
import { COURT_NAMES } from "../fiches";
import { COURTS, SearchResponse, SearchResult, cites, field, mentionsParties, searchQuery } from "../resolver";
import { DecisionCandidate, DecisionSource } from "./types";

/** Juridictions essayées quand la fiche n'en indique aucune. */
const ALL_COURTS: CourtCode[] = ["ce", "cassation", "cc"];

/** Une recherche refusée (400) ou sans objet (404) n'empêche pas d'essayer la suivante. */
async function search(plugin: LegifrancePlugin, body: ReturnType<typeof searchQuery>, lane?: Lane) {
	try {
		return await plugin.api.consult<SearchResponse>(body.path, body.body, lane);
	} catch (error) {
		if (error instanceof ApiError && [400, 404].includes(error.status ?? 0)) return undefined;
		throw error;
	}
}

/** Décisions d'une réponse dont l'identifiant a le préfixe de la juridiction et que `accept` retient. */
function candidates(response: SearchResponse | undefined, code: CourtCode, accept: (title: string, result: SearchResult) => boolean) {
	const court = COURTS[code];
	const found: DecisionCandidate[] = [];
	for (const result of response?.results ?? []) {
		for (const title of result.titles ?? []) {
			if (title.id?.startsWith(court.prefix) && accept(title.title ?? "", result) && !found.some((c) => c.key === title.id)) {
				found.push({
					source: "legifrance",
					key: title.id,
					title: title.title ?? title.id,
					url: legifranceUrl(title.id),
				});
			}
		}
	}
	return found;
}

/** Fonds distincts à interroger (le Tribunal des conflits est dans le fond du Conseil d'État). */
const courtsOf = (query: DecisionQuery) => [...new Set((query.court ? [query.court] : ALL_COURTS).map((code) => (code === "tc" ? "ce" : code)))] as CourtCode[];

export const legifranceSource: DecisionSource = {
	id: "legifrance",
	label: "Légifrance",

	available: (plugin, query) => plugin.hasCredentials && (!query.court || query.court in COURTS),

	async byNumber(plugin, query, lane) {
		if (!query.number) return [];
		const values = { number: query.number, bare: query.number.split(" ")[0] };
		for (const code of courtsOf(query)) {
			const court = COURTS[code];
			for (const [typeChamp, value] of court.fields) {
				const response = await search(plugin, searchQuery(court.fond, [field(typeChamp, values[value])]), lane);
				// Conseil constitutionnel : le suffixe (DC, QPC…) des citations est souvent inexact, le numéro seul suffit.
				const found = candidates(response, code, (title) => cites(title, query.number!) || (code === "cc" && cites(title, values.bare)));
				if (found.length) return found;
			}
			if (code === "cc") {
				// Décisions absentes du fond du Conseil constitutionnel : Journal officiel, puis page du site du Conseil.
				const response = await search(plugin, searchQuery("JORF", [field("ALL", query.number)]), lane);
				for (const result of response?.results ?? []) {
					for (const title of result.titles ?? []) {
						const id = /^JORFTEXT\d{12}/.exec(title.cid || title.id || "")?.[0];
						if (id && /^décision n°/i.test(title.title ?? "") && cites(title.title ?? "", query.number)) {
							return [{ source: "legifrance", key: id, title: title.title ?? id, url: legifranceUrl(id), values: ccValues(id) }];
						}
					}
				}
				const site = await findCcSiteDecision(query.number);
				if (site) return [{ source: "legifrance", key: site.url, title: site.titre, url: site.url, values: ccValues(site.url) }];
			}
		}
		return [];
	},

	async byInfo(plugin, query, lane) {
		if (!query.name) return [];
		const day = query.date;
		const year = day?.slice(0, 4);
		/** Jour exact d'abord, puis année entière : une date de fiche décalée d'un jour est courante. */
		const attempts: ({ start: string; end: string } | undefined)[] = day ? [{ start: day, end: day }, { start: `${year}-01-01`, end: `${year}-12-31` }] : [undefined];

		for (const range of attempts) {
			const filters = range ? [{ facette: "DATE_DECISION", dates: range }] : [];
			const found: DecisionCandidate[] = [];
			for (const code of courtsOf(query)) {
				const court = COURTS[code];
				// Tous les mots du nom d'abord ; si l'API refuse ce type de recherche, phrase exacte.
				let response = await search(plugin, searchQuery(court.fond, [field("ALL", query.name, "TOUS_LES_MOTS_DANS_UN_CHAMP")], filters), lane);
				if (!response) response = await search(plugin, searchQuery(court.fond, [field("ALL", query.name)], filters), lane);
				found.push(
					...candidates(response, code, (title, result) => {
						if (!range) return mentionsParties(result, query.name!);
						const dates = titleDates(title);
						return dates.length === 0 || dates.some((date) => date.year === Number(year) && (range.start !== range.end || matchesDate({ year: Number(year), month: Number(day!.slice(5, 7)), day: Number(day!.slice(8, 10)) }, date)));
					})
				);
			}
			if (found.length) return found.slice(0, 15);
		}
		return [];
	},

	/** Métadonnées de la décision et lien (`/consult/juri`). */
	async values(plugin, key, lane): Promise<DecisionValues> {
		const response = await plugin.api.consultDecision(key, { lane });
		const decision = readDecision(response);
		if (!decision) throw new Error("Légifrance n'a pas renvoyé le texte de cette décision.");
		return {
			date: decision.date,
			court: decision.court && (codeJuridiction.get(decision.court) ?? decision.court),
			formation: decision.formation,
			title: removeTags(decision.title),
			number: decision.number && removeTags(decision.number),
			ecli: decision.ecli,
			solution: decision.solution,
			url: legifranceUrl(key),
		};
	},
};

/**
 * Valeurs d'une décision déjà enregistrée dans la base (texte complété avec la tâche « Compléter les
 * fiches de décisions »), ou `undefined`. Évite une requête à l'API.
 */
export function storedValues(plugin: LegifrancePlugin, key: string): DecisionValues | undefined {
	const row = plugin.references.completeDecision(key);
	if (!row) return undefined;
	// Seul un code (« ce ») a pu être conservé à défaut de la juridiction donnée par l'API : on le traduit.
	const court = row.court ? (COURT_NAMES as Record<string, string>)[row.court] ?? codeJuridiction.get(row.court) ?? (/^[a-z]{2,10}$/.test(row.court) ? undefined : row.court) : undefined;
	return {
		date: row.date ?? undefined,
		court,
		formation: row.formation ?? undefined,
		title: row.title ? removeTags(row.title) : undefined,
		number: row.number ? removeTags(row.number) : undefined,
		ecli: row.ecli ?? undefined,
		solution: row.solution ?? undefined,
		url: legifranceUrl(key),
	};
}
