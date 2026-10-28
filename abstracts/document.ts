/**
 * Le document manipulé par le plugin (`legalDocument`) et les types de la réponse de l'API qui le composent.
 * `getDocumentInfo` complète un document trouvé par une recherche : décisions de justice (`decisions.ts`) ou tous
 * les autres fonds (`consult.ts`).
 */
import type { LegifranceApi } from "api/legifrance";
import { sectionsResultats } from "./searches";
import { getDecisionInfo } from "./decisions";
import { consultDocument } from "./consult";
import { isCaselawOrigin } from "./fonds";

/**
 * Un document de l'API Légifrance (décision, texte, article, convention…), tel que le plugin le manipule : né d'un
 * résultat de recherche (`resultatsRechercheClass.listeResultats`), complété par la consultation
 * (`getDocumentInfo`), conservé dans l'historique (`data.json`) et offert aux modèles de notes (Handlebars :
 * tout champ ci-dessous est une variable `{{champ}}`, voir `creation/newNote.ts`).
 */
export interface legalDocument {
	// --- Identité, d'après le résultat de recherche ---
	/** Identifiant Légifrance (`JURITEXT…`, `LEGITEXT…`, `KALITEXT…` ; sans préfixe pour une circulaire). */
	id: string;
	/** Identifiant chronologique d'un texte (`cid`), qui rassemble ses versions. */
	cid?: string;
	/** Code du fond d'où vient le document (`CETAT`, `JURI`, `CONSTIT`, `LODA_DATE`…, voir `fonds.ts`). */
	fond: string;
	/** Origine du résultat (`origin` de l'API), qui désigne le fond ; sert à choisir la route de consultation. */
	origin: string;
	/** `"jurisprudence"` ou `"document"`. */
	type?: string;
	/** Nature du texte (`CODE`, `LOI`, `ARRETE`…) ; vide pour une décision. */
	nature?: string;
	titre: string;
	/** Extrait trouvé par la recherche (HTML, termes surlignés). */
	texte: string;
	/** Adresse de la page Légifrance (`api/urls.ts`). */
	lien: string;
	/** Date au format AAAA-MM-JJ. */
	date?: string;
	annee?: number;
	/** Lien vers le site du Conseil constitutionnel (décisions du Conseil seulement). */
	urlCC?: string;
	/** Extraits par section, pour les codes et textes (`sections` du résultat de recherche). */
	sections?: sectionsResultats[];

	// --- Décision de justice, après consultation ---
	/** Numéro de la décision (pourvoi, ou « 2018-765 DC »). */
	numero?: string;
	juridiction?: string;
	formation?: string;
	/** Solution de la décision (« Non conformité partielle », « Rejet »…) ; `abstract` la porte aussi pour les décisions issues d'une recherche. */
	solution?: string;
	/** Résumés de la décision (sommaire de l'arrêt) : un élément par entrée du sommaire de l'API. */
	sommaires?: Sommaire[];
	abstract?: string;

	// --- Texte, après consultation ---
	/** Texte intégral en Markdown, et en HTML tel que l'API le renvoie. */
	texteIntegral?: string;
	texteIntegralHTML?: string;
	/** Texte HTML dans la réponse de l'API (avant conversion). */
	texteHtml?: string;
	/** Visas d'un texte (HTML). */
	visa?: string;
	/** Articles d'un texte, dans la réponse de l'API. */
	articles?: statuteArticles[];
	/** Pièce jointe (circulaire, accord d'entreprise) dont le texte est lu côté API. */
	attachment?: Attachment;

	// --- Champs de la réponse brute de l'API, lus à la consultation (voir `decisions.ts`, `consult.ts`) ---
	dateTexte?: string;
	natureJuridiction?: string;
	jurisDate?: string;
	jorfText?: string;
	num?: string;
	/** Résumés de la décision dans la réponse de l'API (avant mise en forme dans `sommaires`). */
	sommaire?: resumeDocument[];

	// --- Saisis par l'utilisateur dans l'éditeur de note (`NoteTaking`) ---
	titreNote: string;
	contributionNote?: string;
	auteur?: string;
	motsCles?: string[];
	motsClesLibres?: string;
	/** Champs personnalisés du modèle de note. */
	notes?: noteChampsPersonnalises[];
}

/** Champ personnalisé de l'éditeur de note : son titre et sa valeur. */
export interface noteChampsPersonnalises {
	titreChamp: string;
	valeurChamp: string;
}

/** Entrée du sommaire d'une décision dans la réponse de l'API. */
export interface resumeDocument {
	resumePrincipal: string;
}

/** Résumé d'une décision, tel qu'affiché et inséré dans la note. */
export interface Sommaire {
	resume: string;
}

/** Pièce jointe d'une circulaire ou d'un accord : texte extrait et métadonnées du fichier. */
export interface Attachment {
	content: string;
	title: string | null;
	name: string | null;
	author: string | null;
	keywords: string | null;
	date: number;
	content_type: string;
	content_length: number;
	language: string;
}

/** Article d'un texte, dans l'arbre de sections de l'API. */
export interface statuteArticles {
	content: string;
	num: number | string;
	cid: string;
}

/** Section d'un texte (titre, articles, sous-sections), dans la réponse de l'API. */
export interface statuteSections {
	title: string;
	articles: statuteArticles[];
	sections?: statuteSections[];
}

/**
 * Complète la fiche d'un document trouvé par une recherche (texte, métadonnées) : décisions de
 * justice par `getDecisionInfo`, tous les autres fonds par `consultDocument`.
 */
export async function getDocumentInfo(document: legalDocument, valeurRecherche: string, api: LegifranceApi) {
	if (isCaselawOrigin(document.origin)) return getDecisionInfo(document, valeurRecherche, api);
	return consultDocument(document, valeurRecherche, api);
}
