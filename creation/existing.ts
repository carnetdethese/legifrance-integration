/**
 * Reconnaît, parmi les propriétés d'une note, celles qui désignent un document que l'on s'apprête à
 * enregistrer : avant de créer une note, on vérifie que le coffre ne l'a pas déjà. Module indépendant
 * d'Obsidian (le plugin fournit les propriétés).
 */
import type { LegalDocument } from "abstracts/document";
import { removeTags } from "lib/tools";
import { CourtCode, DecisionValues, Frontmatter, bareNumber, courtCode, ficheId, ficheQuery, isFiche, plainText } from "references/fiches";

type FicheSettings = Parameters<typeof ficheId>[1];

/** Une propriété (ou l'une de ses valeurs, si c'est une liste) contient l'identifiant : la note est celle du document. */
export function mentionsId(frontmatter: Frontmatter, id: string) {
	if (!frontmatter || !id) return false;
	const holds = (value: unknown): boolean => (typeof value === "string" ? value.includes(id) : Array.isArray(value) && value.some(holds));
	return Object.values(frontmatter).some(holds);
}

/**
 * Cette fiche, qui ne dit pas de quelle décision elle parle, pourrait-elle être celle de `data` ? Oui si le
 * numéro est le même (et la juridiction, quand les deux la connaissent), ou si la date et le nom sont les mêmes.
 * Une fiche déjà liée à une autre décision n'est jamais candidate.
 */
export function mayBeFicheOf(frontmatter: Frontmatter, settings: FicheSettings, data: LegalDocument) {
	if (!isFiche(frontmatter, settings) || ficheId(frontmatter, settings)) return false;
	const query = ficheQuery(frontmatter, settings);
	const court: CourtCode | undefined = courtCode(data.juridiction);
	if (query.number && data.numero && bareNumber(query.number) === bareNumber(data.numero)) return !query.court || !court || query.court === court;
	const title = removeTags(data.titre);
	return !!query.name && !!query.date && query.date === data.date?.slice(0, 10) && plainText(query.name) === plainText(title);
}

/** Valeurs connues du document, pour renseigner une fiche liée (les propriétés déjà remplies sont conservées). */
export function valuesOfDocument(data: LegalDocument): DecisionValues {
	const values: DecisionValues = {
		date: data.date?.slice(0, 10),
		court: data.juridiction,
		formation: data.formation,
		title: removeTags(data.titre),
		number: data.numero,
		solution: data.solution,
		url: data.lien,
	};
	return Object.fromEntries(Object.entries(values).filter(([, value]) => value));
}
