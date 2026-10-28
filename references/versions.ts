/**
 * Versions d'un article et version en vigueur à une date. L'API (`/consult/getArticle`) donne, pour un
 * article, la liste de ses versions avec leurs dates de début et de fin de vigueur (en millisecondes ;
 * 2999 quand la version n'a pas de fin). Une décision applique l'article tel qu'il était le jour où elle
 * a été rendue, pas tel qu'il est aujourd'hui. Module pur.
 */

/** Une version d'un article. */
export interface ArticleVersion {
	/** Identifiant Légifrance de cette version (`LEGIARTI…`). */
	id: string;
	/** `VIGUEUR`, `MODIFIE`, `ABROGE`… */
	status: string;
	/** Premier jour de vigueur (AAAA-MM-JJ), ou `null` si l'API ne le donne pas. */
	start: string | null;
	/** Premier jour où la version n'est plus en vigueur (AAAA-MM-JJ), ou `null` si elle l'est encore. */
	end: string | null;
	version?: string;
}

/** Au-delà de cette année, une date de fin de l'API veut dire « sans fin » (elle donne 2999). */
const OPEN_ENDED_YEAR = 2900;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Versions d'un article d'après la réponse de l'API (`article.articleVersions`), de la plus ancienne à la plus récente. */
export function parseVersions(response: unknown): ArticleVersion[] {
	const article = (response as { article?: unknown })?.article ?? response;
	const list = (article as { articleVersions?: unknown })?.articleVersions;
	if (!Array.isArray(list)) return [];
	const versions: ArticleVersion[] = [];
	for (const item of list as Record<string, unknown>[]) {
		if (typeof item?.id !== "string") continue;
		const start = typeof item.dateDebut === "number" ? isoDay(item.dateDebut) : null;
		const end = typeof item.dateFin === "number" && new Date(item.dateFin).getUTCFullYear() < OPEN_ENDED_YEAR ? isoDay(item.dateFin) : null;
		versions.push({ id: item.id, status: typeof item.etat === "string" ? item.etat : "", start, end, ...(typeof item.version === "string" && { version: item.version }) });
	}
	return versions.sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));
}

/** Premier et dernier jour couverts par une date AAAA-MM-JJ, AAAA-MM ou AAAA ; `null` si elle n'est pas lisible. */
export function dayRange(date: string): [string, string] | null {
	const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(date.trim());
	if (!match) return null;
	const [, year, month, day] = match;
	if (day) return [`${year}-${month}-${day}`, `${year}-${month}-${day}`];
	if (month) {
		const last = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
		return [`${year}-${month}-01`, `${year}-${month}-${String(last).padStart(2, "0")}`];
	}
	return [`${year}-01-01`, `${year}-12-31`];
}

/** Version applicable à une date. */
export interface VersionAtDate {
	/** `exact` : une seule version ; `ambiguous` : la date incomplète couvre plusieurs versions ; `none` : aucune version à cette date. */
	state: "exact" | "ambiguous" | "none";
	/** La version applicable (`exact`), ou la plus récente des versions possibles (`ambiguous`). */
	version?: ArticleVersion;
	/** Toutes les versions possibles. */
	candidates: ArticleVersion[];
	/** Pour `none` : explication (article postérieur ou antérieur à la date). */
	reason?: string;
}

/**
 * Version de l'article en vigueur à `date`. Une version couvre de son premier jour de vigueur au jour qui
 * précède celui où elle cesse (`end` exclu). Une date incomplète (« 1923 », « 2016-10 ») est comparée à
 * toute la période qu'elle couvre : si plusieurs versions s'y succèdent, le résultat est `ambiguous`.
 */
export function versionAt(versions: ArticleVersion[], date: string): VersionAtDate {
	const range = dayRange(date);
	if (!range || versions.length === 0) return { state: "none", candidates: [], reason: range ? "Aucune version connue de cet article." : "Date de la décision illisible." };
	const [from, to] = range;
	const candidates = versions.filter((v) => (v.start === null || v.start <= to) && (v.end === null || v.end > from));
	if (candidates.length === 1) return { state: "exact", version: candidates[0], candidates };
	if (candidates.length > 1) return { state: "ambiguous", version: candidates[candidates.length - 1], candidates };
	const first = versions[0].start;
	const reason = first && to < first ? `L'article n'existe que depuis le ${first}.` : "Aucune version en vigueur à cette date (lacune ou abrogation).";
	return { state: "none", candidates, reason };
}
