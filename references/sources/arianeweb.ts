/**
 * ArianeWeb (Conseil d'État) : décisions anciennes et grands arrêts que Légifrance n'a pas. Sans
 * identifiants ; la décision est connue par l'adresse de sa page, qui porte sa date et son numéro.
 */
import { AriaCandidate, findAriaByName, findAriaByNumber } from "../ariane";
import { ariaValues } from "../fiches";
import { DecisionCandidate, DecisionSource } from "./types";

const toCandidate = (match: AriaCandidate): DecisionCandidate => ({
	source: "arianeweb",
	key: match.url,
	title: match.titre,
	url: match.url,
	values: ariaValues(match.url),
});

export const ariaSource: DecisionSource = {
	id: "arianeweb",
	label: "ArianeWeb (Conseil d'État)",

	available: (plugin, query) => plugin.settings.ficheUseAriane && (!query.court || query.court === "ce" || query.court === "tc"),

	async byNumber(_plugin, query) {
		if (!query.number) return [];
		const found = await findAriaByNumber(query.court ?? "ce", query.number);
		return found.map(toCandidate);
	},

	async byInfo(_plugin, query) {
		if (!query.name || !query.date) return [];
		const [year, month, day] = query.date.split("-").map(Number);
		const found = await findAriaByName(query.court ?? "ce", query.name, { year, month, day });
		return found.map(toCandidate);
	},

	/** Tout est dans l'adresse de la page. */
	values: async (_plugin, key) => ariaValues(key),
};
