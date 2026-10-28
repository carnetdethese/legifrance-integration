/** Revue générale du droit : texte des grands arrêts absents de Légifrance et d'ArianeWeb. */
import { COURT_NAMES, DecisionValues } from "../fiches";
import { RGD_SITE } from "../ids";
import { RgdMatch, findRgdByName, findRgdByNumber, readRgdDecision } from "../rgd";
import { DecisionCandidate, DecisionSource } from "./types";

/** Valeurs d'une décision d'après son titre. */
export const rgdValues = (match: Pick<RgdMatch, "key" | "title" | "courtCode" | "court" | "date" | "number">): DecisionValues => ({
	court: match.courtCode ? COURT_NAMES[match.courtCode] : match.court,
	date: match.date,
	number: match.number,
	title: match.title,
	url: match.key,
});

const toCandidate = (match: RgdMatch): DecisionCandidate => ({ source: "rgd", key: match.key, title: match.title, url: match.key, values: rgdValues(match) });

export const rgdSource: DecisionSource = {
	id: "rgd",
	label: "Revue générale du droit",

	available: (plugin) => plugin.settings.ficheUseRgd,

	async byNumber(_plugin, query) {
		return query.number ? (await findRgdByNumber(query.number, query.court)).map(toCandidate) : [];
	},

	async byInfo(_plugin, query) {
		return query.name ? (await findRgdByName(query.name, query.court, query.date)).map(toCandidate) : [];
	},

	async values(_plugin, key) {
		const decision = await readRgdDecision(key);
		return rgdValues({ ...decision, key });
	},
};

export { RGD_SITE };
