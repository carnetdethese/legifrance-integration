/**
 * ArianeWeb : base de jurisprudence du Conseil d'État, qui a les décisions anciennes et les grands
 * arrêts absents de Légifrance. Pas de documentation : c'est le moteur ouvert du site
 * (`/xsearch?type=json`, sans identifiant), tel que Marginalia le relève. Sert uniquement à
 * retrouver l'adresse d'une décision citée par son nom et sa date.
 */
import { requestUrl } from "obsidian";
import { CitedDate, matchesDate, plain, significantWords } from "./dates";

const BASE_URL = "https://www.conseil-etat.fr";

/** Fonds d'ArianeWeb par juridiction citée. */
const SOURCES: Record<string, string> = { ce: "AW_DCE", tc: "AW_DTC" };

/** Décisions demandées par page, et nombre de pages lues au plus. */
const PAGE_SIZE = 50;
const MAX_PAGES = 4;

/** Document de la réponse, réduit aux champs lus. */
interface AriaDocument {
	/** Date (« 1950-07-07 02:00:00 »). */
	SourceDateTime1?: string;
	/** Numéro de la décision. */
	SourceStr5?: string;
	/** Type (« /CE/decision/ »). */
	SourceStr39?: string;
	Extracts?: string;
	HtmlSummary?: string;
}

/** Résultat : adresse et libellé de la décision. */
export interface AriaMatch {
	url: string;
	titre: string;
}

const documentDay = (doc: AriaDocument): CitedDate | null => {
	const m = doc.SourceDateTime1?.match(/^(\d{4})-(\d{2})-(\d{2})/);
	return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : null;
};

/** Les extraits du document mentionnent-ils tous les mots significatifs du nom des parties ? */
function mentions(doc: AriaDocument, name: string) {
	const text = plain(`${doc.Extracts ?? ""} ${doc.HtmlSummary ?? ""}`.replace(/&[a-z]+;/g, " "));
	return significantWords(name).every((word) => text.includes(word));
}

/**
 * Adresse de la décision du Conseil d'État (ou du Tribunal des conflits) citée par `name` et
 * `cited`. Les résultats sont triés par date : on s'arrête une fois la date de la citation dépassée.
 *
 * @throws Error si ArianeWeb est injoignable ou illisible.
 */
export async function findAriaDecision(court: string, name: string, cited: CitedDate): Promise<AriaMatch | null> {
	const source = SOURCES[court];
	if (!source) return null;

	for (let page = 0; page < MAX_PAGES; page++) {
		const params = new URLSearchParams({
			type: "json",
			advanced: "1",
			SourceStr4: source,
			"text.add": name.replace(/,/g, " "),
			synonyms: "true",
			scmode: "smart",
			SkipCount: String(PAGE_SIZE),
			SkipFrom: String(page * PAGE_SIZE),
			sort: "SourceDateTime1.asc,SourceStr5.desc",
		});
		const response = await requestUrl({ url: `${BASE_URL}/xsearch?${params}`, throw: false });
		if (response.status !== 200) throw new Error(`ArianeWeb : erreur HTTP ${response.status}`);

		const documents: AriaDocument[] = response.json?.Documents ?? [];
		for (const doc of documents) {
			const day = documentDay(doc);
			if (day && doc.SourceStr5 && matchesDate(cited, day) && mentions(doc, name)) {
				const iso = doc.SourceDateTime1!.slice(0, 10);
				const kind = doc.SourceStr39 || "/CE/decision/";
				const [y, m, d] = iso.split("-");
				return {
					url: `${BASE_URL}/fr/arianeweb${kind}${iso}/${doc.SourceStr5}`,
					titre: `Conseil d'État, ${d}/${m}/${y}, n° ${doc.SourceStr5}`,
				};
			}
		}

		const last = documents.length ? documentDay(documents[documents.length - 1]) : null;
		if ((last && last.year > cited.year) || documents.length < PAGE_SIZE) break;
	}
	return null;
}

/** Décision d'ArianeWeb telle que la liste de résultats la présente. */
export interface AriaCandidate extends AriaMatch {
	number: string;
	/** AAAA-MM-JJ */
	date: string;
}

const toCandidate = (doc: AriaDocument): AriaCandidate | null => {
	const iso = doc.SourceDateTime1?.slice(0, 10);
	if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso) || !doc.SourceStr5) return null;
	const [y, m, d] = iso.split("-");
	return {
		url: `${BASE_URL}/fr/arianeweb${doc.SourceStr39 || "/CE/decision/"}${iso}/${doc.SourceStr5}`,
		titre: `Conseil d'État, ${d}/${m}/${y}, n° ${doc.SourceStr5}`,
		number: doc.SourceStr5,
		date: iso,
	};
};

/** Numéro comparé sans espaces, points, tirets ni zéros de tête (« 448 948 » et « 448948 », « 04749 » et « 4749 » sont le même). */
const bareNumber = (number: string) => number.replace(/[\s.-]/g, "").toLowerCase().replace(/^0+(?=\d)/, "");

/**
 * Décisions d'ArianeWeb portant ce numéro (n° de requête). Le filtre sur le numéro est celui du moteur
 * (`SourceStr5`) ; le résultat est contrôlé ici de toute façon.
 *
 * @throws Error si ArianeWeb est injoignable.
 */
export async function findAriaByNumber(court: string, number: string): Promise<AriaCandidate[]> {
	const source = SOURCES[court];
	if (!source) return [];
	const params = new URLSearchParams({
		type: "json",
		advanced: "1",
		SourceStr4: source,
		SourceStr5: number,
		SkipCount: "20",
		SkipFrom: "0",
		sort: "SourceDateTime1.asc,SourceStr5.desc",
	});
	const response = await requestUrl({ url: `${BASE_URL}/xsearch?${params}`, throw: false });
	if (response.status !== 200) throw new Error(`ArianeWeb : erreur HTTP ${response.status}`);
	const documents: AriaDocument[] = response.json?.Documents ?? [];
	return documents
		.filter((doc) => doc.SourceStr5 && bareNumber(doc.SourceStr5) === bareNumber(number))
		.map(toCandidate)
		.filter((candidate): candidate is AriaCandidate => candidate !== null);
}

/**
 * Décisions d'ArianeWeb de la date citée dont les extraits mentionnent les parties (plusieurs
 * résultats possibles : à l'utilisateur de choisir).
 *
 * @throws Error si ArianeWeb est injoignable ou illisible.
 */
export async function findAriaByName(court: string, name: string, cited: CitedDate): Promise<AriaCandidate[]> {
	const source = SOURCES[court];
	if (!source) return [];
	const found: AriaCandidate[] = [];
	for (let page = 0; page < MAX_PAGES; page++) {
		const params = new URLSearchParams({
			type: "json",
			advanced: "1",
			SourceStr4: source,
			"text.add": name.replace(/,/g, " "),
			synonyms: "true",
			scmode: "smart",
			SkipCount: String(PAGE_SIZE),
			SkipFrom: String(page * PAGE_SIZE),
			sort: "SourceDateTime1.asc,SourceStr5.desc",
		});
		const response = await requestUrl({ url: `${BASE_URL}/xsearch?${params}`, throw: false });
		if (response.status !== 200) throw new Error(`ArianeWeb : erreur HTTP ${response.status}`);
		const documents: AriaDocument[] = response.json?.Documents ?? [];
		for (const doc of documents) {
			const day = documentDay(doc);
			const candidate = day && matchesDate(cited, day) && mentions(doc, name) ? toCandidate(doc) : null;
			if (candidate) found.push(candidate);
		}
		const last = documents.length ? documentDay(documents[documents.length - 1]) : null;
		if ((last && last.year > cited.year) || documents.length < PAGE_SIZE) break;
	}
	return found;
}
