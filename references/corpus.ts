/**
 * Lecture de la base pour les analyses : décisions du coffre (citées, enrichies ou non), articles
 * qu'elles visent, rapprochements. Les calculs eux-mêmes sont dans `timeline.ts` et `similarity.ts`.
 */
import { DECISION_REFS_SQL, type ReferenceIndex } from ".";
import type { CitationCheck } from "./checks";
import { COURT_NAMES, CourtCode, DecisionValues, courtCode } from "./fiches";
import { decisionKey } from "./ids";
import { LegalRef, decidedIso, normalizedName, parseCitations } from "./parser";
import type { GraphInput } from "./graph";
import { cleanTheme, topTheme } from "./themes";
import { Excerpt, citingSentence } from "./excerpts";
import type { PlanArticle } from "./plan";
import { DecisionFeatures, RelatedDecision, relatedDecisions, termCounts } from "./similarity";
import { DecisionRecord, betterDate, byDate, ccYear, cleanLabel, dateFromLabel, nameFromNote } from "./timeline";
import { Signatures, courtGroup, mergeAliases, numberSignature } from "./merge";

interface Row {
	key: string;
	kind: LegalRef["kind"];
	label: string;
	data: string;
	url: string | null;
	legifrance_id: string | null;
	status: string | null;
	court: string | null;
	number: string | null;
	title: string | null;
	date: string | null;
	formation: string | null;
	solution: string | null;
	themes: string | null;
	summary: string | null;
}

/** La juridiction telle que l'API la donne, ou son nom complet si seul un code (« ce ») a été conservé. */
const courtName = (court: string | null) => (court ? COURT_NAMES[court as CourtCode] ?? court : undefined);

/** Ce que le plugin sait des fiches du coffre, pour compléter les décisions citées. */
export interface FicheContext {
	/** Note de la fiche → notes qui y renvoient par un lien (`[[fiche]]`). */
	inbound: Map<string, string[]>;
	/** Ce que dit la fiche de sa décision (propriétés de la correspondance). */
	values: (path: string) => DecisionValues;
}

/** Numéros d'une décision d'après le champ « numéro » de Légifrance (« 97263 05822 » : deux requêtes jointes). */
const numbersOf = (group: string, text: string) => (group === "cc" ? [text] : text.split(/[\s,;/]+/)).filter((n) => /\d/.test(n)).map((n) => numberSignature(group, n));

/** Ajoute des indices de rapprochement à une décision. */
function addSigns(record: DecisionRecord, { numbers = [], names = [] }: Partial<Signatures>) {
	const signs = (record.signs ??= { numbers: [], names: [] });
	signs.numbers.push(...numbers);
	signs.names.push(...names);
}

const baseName = (path: string) => path.split("/").pop()!.replace(/\.md$/, "");

/**
 * Toutes les décisions du coffre, une par décision : celles que les notes citent (les différentes
 * façons de la citer sont regroupées par identifiant Légifrance), puis les fiches. Une décision
 * est « citée » par une note qui l'écrit (« CE, 2007, Arcelor ») ou qui renvoie à sa fiche
 * (`[[arcelor2007]]`) ; une fiche ne compte pas pour sa propre décision.
 */
export function loadDecisions(index: ReferenceIndex, fiches?: FicheContext): DecisionRecord[] {
	const rows = index.db.all<Row>(
		`SELECT r.key, r.kind, r.label, r.data, r.url, d.legifrance_id, d.status, d.court, d.number, d.title, d.date, d.formation, d.solution, d.themes, d.summary
		 FROM refs r LEFT JOIN decisions d ON d.ref_key = r.key
		 WHERE ${DECISION_REFS_SQL}`
	);
	const notesOf = index.notesByRef("SELECT ref_key, note_path FROM citations");

	const records = new Map<string, DecisionRecord>();
	addCitedDecisions(index, records, rows, notesOf);
	if (fiches) addFiches(index, records, fiches);
	// Une même décision citée par son nom, par son numéro, avec sa fiche et sous son identifiant Légifrance : une seule décision.
	const merged = mergeAliases([...records.values()], index.manualMerges());
	// Une fiche ne se cite pas elle-même (son en-tête contient la citation et le lien de sa décision).
	for (const record of merged) record.notes = record.notes.filter((path) => path !== record.fichePath);
	return merged;
}

/** Première phase : une décision par identifiant Légifrance, regroupant les références qui la citent. */
function addCitedDecisions(index: ReferenceIndex, records: Map<string, DecisionRecord>, rows: Row[], notesOf: Map<string, string[]>) {
	for (const row of rows) {
		const ref: LegalRef = { key: row.key, kind: row.kind, label: row.label, query: "", data: JSON.parse(row.data), ...(row.url && { url: row.url }) };
		const link = index.linkFor(ref);
		const id = row.legifrance_id ?? decisionKey(row.label) ?? decisionKey(row.url ?? "") ?? decisionKey(link?.url ?? "") ?? row.key;
		const complete = row.status === "complete";
		const known = records.get(id);
		const record: DecisionRecord = known ?? { id, label: cleanLabel(row.label), themes: [], complete: false, notes: [], members: [id] };

		record.notes = [...new Set([...record.notes, ...(notesOf.get(row.key) ?? [])])];
		record.name ??= ref.data.name || undefined;
		record.refKeys = [...(record.refKeys ?? []), row.key];
		if (row.kind === "decision") record.cited = [...new Set([...(record.cited ?? []), cleanLabel(row.label)])];
		record.fichePath ??= index.ficheFor(ref);
		record.url ??= link?.url ?? row.url ?? undefined;
		if (complete && !record.complete) {
			record.complete = true;
			record.title = row.title ?? undefined;
			record.court = courtName(row.court);
			record.number = row.number ?? undefined;
			record.date = betterDate(record.date, row.date ?? undefined);
			record.formation = row.formation ?? undefined;
			record.solution = row.solution ?? undefined;
			record.summary = row.summary ?? undefined;
			record.themes = row.themes ? [...new Set((JSON.parse(row.themes) as string[]).map(cleanTheme).filter(Boolean))] : [];
		}
		// Date, de la plus sûre à la plus approximative : celle citée avec les parties, celle écrite dans la citation, l'année du numéro.
		record.date = betterDate(record.date, (ref.data.decided ? decidedIso(ref.data.decided) : undefined) ?? dateFromLabel(row.label) ?? (ref.data.court === "cc" ? ccYear(ref.data.number) : undefined));
		if (!record.court && ref.data.court) record.court = courtName(ref.data.court);
		records.set(id, record);

		// Indices de rapprochement : numéro cité, nom et date cités (par les parties, ou écrits avant le numéro), numéros de la décision complète.
		const group = courtGroup(ref.data.court);
		if (group && ref.data.number) addSigns(record, { numbers: [numberSignature(group, ref.data.number)] });
		if (group && ref.data.name && ref.data.decided) addSigns(record, { names: [{ group, date: ref.data.decided, name: normalizedName(ref.data.name) }] });
		const completeGroup = complete ? courtGroup(courtCode(row.court) ?? ref.data.court) : undefined;
		if (completeGroup && row.number) addSigns(record, { numbers: numbersOf(completeGroup, row.number) });
	}
}

/** Seconde phase : les fiches complètent la décision de même identifiant, ou en créent une. */
function addFiches(index: ReferenceIndex, records: Map<string, DecisionRecord>, fiches: FicheContext) {
	for (const { path, id: ficheId } of index.ficheEntries()) {
		const id = ficheId ?? `fiche:${path}`;
		const record: DecisionRecord = records.get(id) ?? { id, label: baseName(path), themes: [], complete: false, notes: [], members: [id] };
		const values = fiches.values(path);
		record.fichePath = path;
		record.name ??= nameFromNote(baseName(path));
		record.notes = [...new Set([...record.notes, ...(fiches.inbound.get(path) ?? [])])];
		record.title ??= values.title;
		record.court ??= values.court;
		record.number ??= values.number;
		record.formation ??= values.formation;
		record.solution ??= values.solution;
		record.url ??= values.url;
		// Indices de la fiche : son numéro, et son nom (intitulé ou titre de la note) avec sa juridiction et sa date.
		const group = courtGroup(courtCode(values.court ?? record.court));
		if (group && values.number) addSigns(record, { numbers: numbersOf(group, values.number) });
		if (group && values.date?.length === 10) {
			const names = [...new Set([baseName(path), values.title ?? ""].map(normalizedName).filter(Boolean))];
			addSigns(record, { names: names.map((name) => ({ group, date: values.date!, name })) });
		}
		// La date de la fiche (écrite par l'utilisateur) prime sur une date devinée dans une citation.
		record.date = values.date ?? record.date;
		records.set(id, record);
	}
}

/** Citations de décisions dont la décision complète est en base, avec ce que les notes en écrivent. */
export function loadCitationChecks(index: ReferenceIndex): CitationCheck[] {
	const notesOf = index.notesByRef("SELECT ref_key, note_path FROM citations");
	return index.db
		.all<{ key: string; label: string; data: string; date: string | null; number: string | null }>(
			`SELECT r.key, r.label, r.data, d.date, d.number FROM refs r JOIN decisions d ON d.ref_key = r.key
			 WHERE r.kind = 'decision' AND d.status = 'complete'`
		)
		.map((row) => {
			const data = JSON.parse(row.data) as Record<string, string>;
			return {
				key: row.key,
				label: cleanLabel(row.label),
				court: data.court,
				decided: data.decided,
				number: data.number,
				actualDate: row.date,
				actualNumber: row.number,
				notes: notesOf.get(row.key) ?? [],
			};
		});
}

/** Éléments de comparaison des décisions dont le texte a été analysé, par identifiant. */
export function loadFeatures(index: ReferenceIndex, records: DecisionRecord[]): Map<string, DecisionFeatures> {
	const byId = new Map(records.map((r) => [r.id, r]));
	const articles = new Map<string, Record<string, string>>();
	for (const row of index.db.all<{ decision_id: string; article_key: string; label: string }>("SELECT decision_id, article_key, label FROM decision_articles")) {
		articles.set(row.decision_id, { ...(articles.get(row.decision_id) ?? {}), [row.article_key]: row.label });
	}
	const features = new Map<string, DecisionFeatures>();
	for (const row of index.db.all<{ legifrance_id: string; terms: string }>(
		"SELECT legifrance_id, terms FROM decisions WHERE status = 'complete' AND terms IS NOT NULL AND legifrance_id IS NOT NULL"
	)) {
		const record = byId.get(row.legifrance_id);
		if (!record) continue;
		features.set(record.id, {
			id: record.id,
			label: record.title ?? record.label,
			terms: JSON.parse(row.terms),
			articles: articles.get(record.id) ?? {},
			themes: record.themes,
			notes: record.notes,
		});
	}
	return features;
}

/** Décisions proches de `id`, parmi celles dont le texte est analysé. */
export function relatedTo(index: ReferenceIndex, records: DecisionRecord[], id: string, limit = 8): RelatedDecision[] {
	const features = loadFeatures(index, records);
	const target = features.get(id);
	return target ? relatedDecisions(target, [...features.values()], limit) : [];
}

/**
 * Analyse en local les textes déjà enregistrés mais pas encore analysés (décisions complétées avant
 * cette fonction) : vocabulaire et articles visés. Aucune requête à l'API.
 * @returns le nombre de décisions analysées.
 */
export function analyzeStoredDecisions(index: ReferenceIndex) {
	const rows = index.db.all<{ legifrance_id: string; text_markdown: string; summary: string | null }>(
		"SELECT legifrance_id, text_markdown, summary FROM decisions WHERE status = 'complete' AND terms IS NULL AND text_markdown IS NOT NULL AND legifrance_id IS NOT NULL"
	);
	index.db.transaction(() => {
		for (const row of rows) {
			index.db.run("UPDATE decisions SET terms = ? WHERE legifrance_id = ?", [JSON.stringify(termCounts(`${row.text_markdown} ${row.summary ?? ""}`)), row.legifrance_id]);
			const articles = parseCitations(row.text_markdown)
				.filter(({ ref }) => ref.kind === "article" || ref.kind === "eu")
				.map(({ ref, count }) => ({ key: ref.key, label: ref.label, count }));
			index.db.run("DELETE FROM decision_articles WHERE decision_id = ?", [row.legifrance_id]);
			for (const { key, label, count } of articles) {
				index.db.run("INSERT OR REPLACE INTO decision_articles (decision_id, article_key, label, count) VALUES (?, ?, ?, ?)", [row.legifrance_id, key, label, count]);
			}
		}
	});
	return rows.length;
}

/** Article visé par les décisions de la base, et nombre de décisions qui l'appliquent. */
export interface ArticleCount {
	key: string;
	label: string;
	/** Nombre de décisions de la base qui l'appliquent. */
	n: number;
	/** Texte dont il est tiré (« Code civil », « RGPD »). */
	text: string;
	/** Statut de vigueur relevé quand son lien a été retrouvé (absent : lien non retrouvé). */
	status: string | null;
}

/** Façon de classer les articles. */
export type ArticleSort = "applied" | "text";

/** Filtre sur la vigueur d'un article : tous, en vigueur, plus en vigueur, ou statut inconnu (lien non retrouvé). */
export type ArticleVigor = "" | "force" | "stale" | "unknown";

/** Texte à chercher dans un `LIKE` (les jokers `%` et `_` sont pris à la lettre). */
const likePattern = (needle: string) => `%${needle.replace(/[\\%_]/g, "\\$&")}%`;

/** Libellé d'un article (« Code civil, art. 1240 », « Préambule de 1946, al. 3 ») : le texte, puis le numéro. */
const TEXT_SQL = `CASE WHEN instr(label, ', art. ') > 0 THEN substr(label, 1, instr(label, ', art. ') - 1)
	WHEN instr(label, ', al. ') > 0 THEN substr(label, 1, instr(label, ', al. ') - 1) ELSE label END`;
const NUMBER_SQL = "CASE WHEN instr(label, ', art. ') > 0 THEN substr(label, instr(label, ', art. ') + 7) ELSE '' END";

/** Articles visés, une ligne par article, avec son texte, son nombre de décisions et son statut de vigueur. */
const ARTICLES_SQL = `SELECT key, label, n, ${TEXT_SQL} AS text, status FROM (
	SELECT da.article_key AS key, MIN(da.label) AS label, COUNT(*) AS n, MAX(l.status) AS status
	FROM decision_articles da LEFT JOIN links l ON l.ref_key = da.article_key GROUP BY da.article_key
)`;

export interface ArticleFilters {
	needle?: string;
	/** Texte exact (« Code civil »). */
	text?: string;
	vigor?: ArticleVigor;
}

function articleWhere({ needle = "", text = "", vigor = "" }: ArticleFilters) {
	const clauses: string[] = [];
	const params: string[] = [];
	if (needle.trim()) {
		clauses.push("label LIKE ? ESCAPE '\\'");
		params.push(likePattern(needle.trim()));
	}
	if (text) {
		clauses.push("text = ?");
		params.push(text);
	}
	if (vigor === "force") clauses.push("status IN ('VIGUEUR', 'VIGUEUR_DIFF')");
	if (vigor === "stale") clauses.push("status IS NOT NULL AND status NOT IN ('VIGUEUR', 'VIGUEUR_DIFF')");
	if (vigor === "unknown") clauses.push("status IS NULL");
	return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

/**
 * Une page des articles appliqués par les décisions de la base, avec le nombre total d'articles
 * correspondants. Le filtrage, le tri et la pagination se font dans la base : rien n'est chargé en
 * mémoire au-delà de la page demandée. Tri « applied » : les plus appliqués d'abord ; « text » : par
 * texte, puis par numéro (les numéros courts avant les longs : 99 avant 1240).
 */
export function articlePage(index: ReferenceIndex, { sort = "applied", limit = 80, offset = 0, ...filters }: ArticleFilters & { sort?: ArticleSort; limit?: number; offset?: number } = {}) {
	const { where, params } = articleWhere(filters);
	const total = index.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM (${ARTICLES_SQL}) ${where}`, params)?.n ?? 0;
	const order = sort === "text" ? `text COLLATE NOCASE, length(${NUMBER_SQL}), ${NUMBER_SQL}, label` : "n DESC, text COLLATE NOCASE, length(" + NUMBER_SQL + "), " + NUMBER_SQL;
	const rows = index.db.all<ArticleCount>(`SELECT * FROM (${ARTICLES_SQL}) ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, offset]);
	return { rows, total };
}

/** Textes dont des articles sont visés (« Code civil », « RGPD »), avec le nombre d'articles de chacun. */
export const articleTexts = (index: ReferenceIndex) =>
	index.db.all<{ text: string; n: number }>(`SELECT text, COUNT(*) AS n FROM (${ARTICLES_SQL}) GROUP BY text ORDER BY text COLLATE NOCASE`);

/** Un article visé par au moins une décision, d'après sa clef. */
export const articleByKey = (index: ReferenceIndex, key: string) => index.db.get<ArticleCount>(`SELECT * FROM (${ARTICLES_SQL}) WHERE key = ?`, [key]);

/** Décisions qui visent l'article `key`. */
export function decisionsApplying(index: ReferenceIndex, records: DecisionRecord[], key: string) {
	const ids = new Set(index.db.all<{ decision_id: string }>("SELECT decision_id FROM decision_articles WHERE article_key = ?", [key]).map((r) => r.decision_id));
	return records.filter((r) => ids.has(r.id));
}

/** Nombre de décisions de la base qui visent l'article `key`. */
export const countApplying = (index: ReferenceIndex, key: string) =>
	index.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM decision_articles WHERE article_key = ?", [key])?.n ?? 0;

/** Statuts de vigueur de l'API Légifrance, en toutes lettres. */
const STATUS_LABELS: Record<string, string> = {
	VIGUEUR: "En vigueur",
	VIGUEUR_DIFF: "En vigueur différée",
	ABROGE: "Abrogé",
	ABROGE_DIFF: "Abrogé (différé)",
	MODIFIE: "Modifié",
	MODIFIE_MORT_NE: "Modifié (mort-né)",
	PERIME: "Périmé",
	TRANSFERE: "Transféré",
	ANNULE: "Annulé",
	DISJOINT: "Disjoint",
	REMPLACE: "Remplacé",
	SANS_ETAT: "Sans état",
};

/** Statut de vigueur lisible (« ABROGE » → « Abrogé »). Un statut inconnu est laissé tel quel. */
export const statusLabel = (status: string | null | undefined) => (status ? STATUS_LABELS[status] ?? status : "inconnu");

/** Articles cités dans le coffre dont la version en vigueur n'a pas été trouvée (abrogés, périmés…). */
export function staleArticles(index: ReferenceIndex) {
	const rows = index.db.all<{ key: string; label: string; status: string; url: string }>(
		`SELECT r.key, r.label, l.status, l.url FROM links l JOIN refs r ON r.key = l.ref_key
		 WHERE r.kind = 'article' AND l.status IS NOT NULL AND l.status NOT IN ('VIGUEUR', 'VIGUEUR_DIFF') ORDER BY r.label`
	);
	const notesOf = index.notesByRef(
		`SELECT c.ref_key, c.note_path FROM citations c JOIN links l ON l.ref_key = c.ref_key JOIN refs r ON r.key = c.ref_key
		 WHERE r.kind = 'article' AND l.status IS NOT NULL AND l.status NOT IN ('VIGUEUR', 'VIGUEUR_DIFF') ORDER BY c.note_path`
	);
	return rows.map((row) => ({ ...row, notes: notesOf.get(row.key) ?? [] }));
}

/**
 * Ce que le graphe des citations lit dans la base : les décisions (une par `DecisionRecord`), les articles
 * que leur texte vise, les articles que les notes écrivent. Les articles visés par une décision sont
 * rattachés à la décision regroupée (`members`) : une même décision citée de plusieurs façons n'est qu'un nœud.
 */
export function loadGraphInput(index: ReferenceIndex, records: DecisionRecord[]): GraphInput {
	const recordOf = new Map<string, string>();
	for (const record of records) for (const member of record.members ?? [record.id]) recordOf.set(member, record.id);

	const applied = new Map<string, { decisionId: string; key: string; label: string; count: number }>();
	for (const row of index.db.all<{ decision_id: string; article_key: string; label: string; count: number }>("SELECT decision_id, article_key, label, count FROM decision_articles")) {
		const decisionId = recordOf.get(row.decision_id);
		if (!decisionId) continue;
		const id = `${decisionId}|${row.article_key}`;
		const known = applied.get(id);
		if (known) known.count = Math.max(known.count, row.count);
		else applied.set(id, { decisionId, key: row.article_key, label: row.label, count: row.count });
	}

	return {
		decisions: records.map((r) => ({
			id: r.id,
			label: r.name ?? r.title ?? r.label,
			themes: [...new Set(r.themes.map(topTheme))],
			date: r.date,
			fiche: !!r.fichePath,
			notes: r.notes,
		})),
		decisionArticles: [...applied.values()],
		noteArticles: index.db
			.all<{ note: string; key: string; label: string }>(
				"SELECT c.note_path AS note, r.key AS key, r.label AS label FROM citations c JOIN refs r ON r.key = c.ref_key WHERE r.kind IN ('article', 'eu')"
			),
	};
}

/** Décision qui applique un article, avec la phrase où elle le cite. */
export interface ArticleExcerpt {
	decisionId: string;
	title: string;
	date: string | null;
	excerpt: Excerpt;
}

/**
 * Phrases où les décisions de la base (texte intégral récupéré) citent l'article `key`, les plus récentes
 * d'abord. Les textes sont lus et analysés à la demande, jamais conservés.
 */
export function articleExcerpts(index: ReferenceIndex, key: string, limit = 5): ArticleExcerpt[] {
	const rows = index.db.all<{ legifrance_id: string; title: string | null; date: string | null; text_markdown: string }>(
		`SELECT d.legifrance_id, d.title, d.date, d.text_markdown FROM decision_articles da
		 JOIN decisions d ON d.legifrance_id = da.decision_id
		 WHERE da.article_key = ? AND d.status = 'complete' AND d.text_markdown IS NOT NULL
		 GROUP BY d.legifrance_id ORDER BY d.date DESC`,
		[key]
	);
	const found: ArticleExcerpt[] = [];
	for (const row of rows) {
		const excerpt = citingSentence(row.text_markdown, key);
		if (excerpt) found.push({ decisionId: row.legifrance_id, title: row.title ?? row.legifrance_id, date: row.date, excerpt });
		if (found.length >= limit) break;
	}
	return found;
}

/** Phrase où l'une des décisions `ids` (une décision regroupée en a plusieurs) cite l'article `key`. */
export function excerptFor(index: ReferenceIndex, ids: string[], key: string): Excerpt | undefined {
	if (ids.length === 0) return undefined;
	const rows = index.db.all<{ text_markdown: string }>(
		`SELECT text_markdown FROM decisions WHERE status = 'complete' AND text_markdown IS NOT NULL AND legifrance_id IN (${ids.map(() => "?").join(",")})`,
		ids
	);
	for (const row of rows) {
		const excerpt = citingSentence(row.text_markdown, key);
		if (excerpt) return excerpt;
	}
	return undefined;
}

/** Articles appliqués par chaque décision, par identifiant de `DecisionRecord` (les décisions regroupées sont réunies). */
export function articlesByDecision(index: ReferenceIndex, records: DecisionRecord[]): Map<string, PlanArticle[]> {
	const recordOf = new Map<string, string>();
	for (const record of records) for (const member of record.members ?? [record.id]) recordOf.set(member, record.id);
	const byRecord = new Map<string, Map<string, PlanArticle>>();
	for (const row of index.db.all<{ decision_id: string; label: string; count: number }>("SELECT decision_id, label, count FROM decision_articles")) {
		const id = recordOf.get(row.decision_id);
		if (!id) continue;
		const articles = byRecord.get(id) ?? new Map<string, PlanArticle>();
		const known = articles.get(row.label);
		if (known) known.count = Math.max(known.count, row.count);
		else articles.set(row.label, { label: row.label, count: row.count });
		byRecord.set(id, articles);
	}
	return new Map([...byRecord].map(([id, articles]) => [id, [...articles.values()]]));
}

/** Articles et textes cités par les notes (ou par une seule), avec leur adresse et leur statut de vigueur. */
export function citedTexts(index: ReferenceIndex, notePath?: string) {
	return index.db.all<{ label: string; url: string | null; fallback_url: string | null; link_url: string | null; status: string | null; notes: number }>(
		`SELECT r.label, r.url, r.fallback_url, l.url AS link_url, l.status, COUNT(DISTINCT c.note_path) AS notes
		 FROM refs r JOIN citations c ON c.ref_key = r.key LEFT JOIN links l ON l.ref_key = r.key
		 WHERE r.kind IN ('article', 'texte', 'eu') ${notePath ? "AND c.note_path = ?" : ""}
		 GROUP BY r.key ORDER BY r.label`,
		notePath ? [notePath] : []
	);
}

/** Un article cité dans les notes, et les décisions de la base qui l'appliquent sans être citées là où il l'est. */
export interface CorpusGap {
	key: string;
	label: string;
	status: string | null;
	/** Notes qui citent l'article. */
	citedIn: string[];
	/** Nombre de citations de l'article dans ces notes. */
	citations: number;
	/** Décisions qui l'appliquent et qu'aucune de ces notes ne cite. */
	decisions: DecisionRecord[];
}

/**
 * Lacunes du corpus : pour chaque article cité par vos notes (ou par la seule `notePath`), les décisions
 * de la base (texte intégral analysé) qui l'appliquent et que ces notes ne citent pas. Aucune requête à
 * l'API : seules les décisions que le coffre connaît déjà sont proposées. Les articles les plus cités
 * d'abord ; ceux sans lacune sont omis.
 */
export function corpusGaps(index: ReferenceIndex, records: DecisionRecord[], notePath?: string): CorpusGap[] {
	const recordOf = new Map<string, DecisionRecord>();
	for (const record of records) for (const member of record.members ?? [record.id]) recordOf.set(member, record);

	const articles = new Map<string, CorpusGap>();
	for (const row of index.db.all<{ key: string; label: string; note_path: string; count: number; status: string | null }>(
		`SELECT r.key, r.label, c.note_path, c.count, l.status FROM citations c JOIN refs r ON r.key = c.ref_key LEFT JOIN links l ON l.ref_key = r.key
		 WHERE r.kind = 'article' ${notePath ? "AND c.note_path = ?" : ""}`,
		notePath ? [notePath] : []
	)) {
		const gap = articles.get(row.key) ?? { key: row.key, label: row.label, status: row.status, citedIn: [], citations: 0, decisions: [] };
		gap.citedIn.push(row.note_path);
		gap.citations += row.count;
		articles.set(row.key, gap);
	}

	const applying = new Map<string, Set<DecisionRecord>>();
	for (const row of index.db.all<{ decision_id: string; article_key: string }>("SELECT decision_id, article_key FROM decision_articles")) {
		const record = articles.has(row.article_key) ? recordOf.get(row.decision_id) : undefined;
		if (!record) continue;
		const set = applying.get(row.article_key) ?? new Set<DecisionRecord>();
		set.add(record);
		applying.set(row.article_key, set);
	}

	const gaps: CorpusGap[] = [];
	for (const gap of articles.values()) {
		// Une fiche qui cite l'article est la décision elle-même, pas une lacune.
		gap.decisions = [...(applying.get(gap.key) ?? [])]
			.filter((r) => !r.notes.some((n) => gap.citedIn.includes(n)) && !(r.fichePath && gap.citedIn.includes(r.fichePath)))
			.sort(byDate);
		if (gap.decisions.length) gaps.push(gap);
	}
	return gaps.sort((a, b) => b.citations - a.citations || b.decisions.length - a.decisions.length || a.label.localeCompare(b.label));
}

/** Notes qui citent au moins un article, pour choisir la note à examiner. */
export const notesCitingArticles = (index: ReferenceIndex) =>
	index.db
		.all<{ note_path: string }>("SELECT DISTINCT c.note_path FROM citations c JOIN refs r ON r.key = c.ref_key WHERE r.kind = 'article' ORDER BY c.note_path")
		.map((row) => row.note_path);
