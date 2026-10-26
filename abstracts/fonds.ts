/**
 * Registre des fonds de l'API Légifrance : pour chacun, son libellé, la façon de filtrer par date
 * et ses critères de tri. Source unique pour le menu de recherche, la construction de la requête
 * et le typage des documents trouvés.
 */

/** Filtre de date d'un fond : aucun, période (début / fin) ou date de version unique. */
export type DateMode = "none" | "range" | "single";

export type FondGroup = "Jurisprudence" | "Législation" | "Autres fonds" | "Tous les fonds";

export interface FondDef {
	/** Code du fond dans la requête `/search`. */
	code: string;
	label: string;
	group: FondGroup;
	dateMode: DateMode;
	/** Facette de date : fixe, ou selon le critère de tri choisi. */
	dateFacet: string | ((sort: string) => string);
	/** Critères de tri propres au fond (code API → libellé). */
	sorts: Record<string, string>;
	/** Jurisprudence : les documents sont des décisions de justice. */
	caselaw?: boolean;
}

/** Critères de tri partagés par plusieurs fonds. */
const SORT_DECISION = { DATE_ASC: "Chronologique", DATE_DESC: "Antéchronologique" };
const SORT_CNIL = { DATE_DECISION_ASC: "Chronologique", DATE_DECISION_DESC: "Antéchronologique" };
const SORT_TEXTS = {
	SIGNATURE_DATE_ASC: "Date signature asc",
	SIGNATURE_DATE_DESC: "Date signature desc",
	PUBLICATION_DATE_ASC: "Date publication asc",
	PUBLICATION_DATE_DESC: "Date publication desc",
};
const SORT_CIRC = {
	SIGNATURE_DATE_ASC: "Date signature asc",
	SIGNATURE_DATE_DESC: "Date signature desc",
	PUBLI_DATE_ASC: "Date publication asc",
	PUBLI_DATE_DESC: "Date publication desc",
};

/** Facette des textes : signature ou publication selon le tri. */
const byTextSort = (sort: string) => (sort.toLowerCase().includes("signature") ? "DATE_SIGNATURE" : "DATE_PUBLICATION");

export const FONDS: FondDef[] = [
	{ code: "ALL", label: "Tous les fonds", group: "Tous les fonds", dateMode: "none", dateFacet: "", sorts: {} },

	{ code: "CONSTIT", label: "Conseil constitutionnel", group: "Jurisprudence", dateMode: "range", dateFacet: "DATE_DECISION", sorts: SORT_DECISION, caselaw: true },
	{ code: "CETAT", label: "Juridictions administratives", group: "Jurisprudence", dateMode: "range", dateFacet: "DATE_DECISION", sorts: SORT_DECISION, caselaw: true },
	{ code: "JURI", label: "Juridictions judiciaires", group: "Jurisprudence", dateMode: "range", dateFacet: "DATE_DECISION", sorts: SORT_DECISION, caselaw: true },
	{ code: "JUFI", label: "Juridictions financières", group: "Jurisprudence", dateMode: "range", dateFacet: "DATE_DECISION", sorts: SORT_DECISION, caselaw: true },
	{ code: "CNIL", label: "CNIL", group: "Jurisprudence", dateMode: "none", dateFacet: "DATE_DECISION", sorts: SORT_CNIL, caselaw: true },

	{ code: "LODA_ETAT", label: "Lois et règlements (en vigueur)", group: "Législation", dateMode: "none", dateFacet: byTextSort, sorts: SORT_TEXTS },
	{ code: "LODA_DATE", label: "Lois et règlements (à une date)", group: "Législation", dateMode: "single", dateFacet: "DATE_VERSION", sorts: SORT_TEXTS },
	{ code: "CODE_ETAT", label: "Codes (en vigueur)", group: "Législation", dateMode: "none", dateFacet: "", sorts: {} },
	{ code: "CODE_DATE", label: "Codes (à une date)", group: "Législation", dateMode: "single", dateFacet: "DATE_VERSION", sorts: {} },
	{ code: "JORF", label: "Journal officiel", group: "Législation", dateMode: "range", dateFacet: byTextSort, sorts: SORT_TEXTS },
	{ code: "CIRC", label: "Circulaires et instructions", group: "Législation", dateMode: "none", dateFacet: "", sorts: SORT_CIRC },

	{ code: "KALI", label: "Conventions collectives", group: "Autres fonds", dateMode: "none", dateFacet: "", sorts: {} },
	{ code: "ACCO", label: "Accords d'entreprise", group: "Autres fonds", dateMode: "range", dateFacet: "DATE_SIGNATURE", sorts: SORT_DECISION },
];

const BY_CODE = new Map(FONDS.map((fond) => [fond.code, fond]));

/** Définition d'un fond ; un code inconnu donne un fond sans date ni tri (jamais d'erreur). */
export const fondDef = (code: string): FondDef =>
	BY_CODE.get(code) ?? { code, label: code, group: "Autres fonds", dateMode: "none", dateFacet: "", sorts: {} };

/** Facette de date à utiliser pour le fond et le tri courants. */
export const dateFacetOf = (fond: FondDef, sort: string) =>
	typeof fond.dateFacet === "function" ? fond.dateFacet(sort) : fond.dateFacet;

/** Les documents de cette origine (champ `origin` d'un résultat) sont-ils des décisions de justice ? */
export const isCaselawOrigin = (origin: string) => FONDS.some((fond) => fond.caselaw && fond.code === origin);
