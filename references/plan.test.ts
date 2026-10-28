/** Test du plan de cours et de la bibliographie. Lancer : `npm test`. */
import { BibEntry, decisionEntries, filterDecisions, formatBibliography, isFiltered } from "./bibliography";
import { articleNoteContent, articleProperties, refreshArticleContent, splitLabel } from "./articleNote";
import { coursePlan } from "./plan";
import type { DecisionRecord } from "./timeline";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g !== w) { fail++; console.log("ÉCHEC", name, "\n   obtenu :", g, "\n   attendu:", w); } };

const rec = (id: string, extra: Partial<DecisionRecord>): DecisionRecord => ({ id, label: id, themes: [], complete: false, notes: ["a.md"], members: [id], ...extra });
const records = [
	rec("blanco", { name: "Blanco", date: "1873-02-08", court: "Tribunal des conflits", themes: ["Responsabilité de la puissance publique > État"], solution: "Compétence administrative", url: "https://example.org/blanco" }),
	rec("couiteas", { name: "Couitéas", date: "1923-11-30", court: "Conseil d'État", themes: ["Responsabilité de la puissance publique"], fichePath: "Fiches/couiteas1923.md" }),
	rec("cass", { label: "Cass. civ. 1re, 4 juin 2025", date: "2025-06-04", court: "Cour de cassation" }),
];
const articles = new Map([["couiteas", [{ label: "Code de justice administrative, art. L. 521-1", count: 1 }, { label: "Code civil, art. 1240", count: 3 }]]]);
const link = (path: string, alias: string) => `[[${path.replace(/\.md$/, "")}|${alias}]]`;

const plan = coursePlan(records, articles, link);
eq("titre", plan.split("\n")[0], "## Plan des décisions citées");
eq("thème regroupant deux décisions", plan.includes("### Responsabilité de la puissance publique (2)"), true);
eq("ordre chronologique", plan.indexOf("Blanco") < plan.indexOf("Couitéas"), true);
eq("lien vers la fiche", plan.includes("[[Fiches/couiteas1923|Couitéas]]"), true);
eq("lien web sans fiche", plan.includes("[Blanco](https://example.org/blanco)"), true);
eq("articles, les plus cités d'abord", plan.includes("  - Articles : Code civil, art. 1240 ; Code de justice administrative, art. L. 521-1"), true);
eq("repli sur la juridiction", plan.includes("### Sans thème — Cour de cassation (1)"), true);
eq("sans thème en dernier", plan.indexOf("Sans thème") > plan.indexOf("Couitéas"), true);

import { planThemes } from "./plan";
eq("thèmes du plan", planThemes(records), ["Responsabilité de la puissance publique", "Sans thème — Cour de cassation"]);
const oneTheme = coursePlan(records, articles, link, { theme: "Responsabilité de la puissance publique" });
eq("un seul thème", oneTheme.includes("Blanco") && !oneTheme.includes("Sans thème"), true);
const links = coursePlan(records, articles, link, { linksOnly: true });
eq("liens seulement : fiches, sans articles ni détails", links.endsWith("- [[Fiches/couiteas1923|Couitéas]]") && !links.includes("Articles") && !links.includes("Blanco"), true);
eq("liens seulement : groupe sans fiche omis", links.includes("Sans thème"), false);
eq("niveau du titre", coursePlan(records, articles, link, { level: 3 }).startsWith("### Plan"), true);

// Bibliographie
const entries: BibEntry[] = [
	...decisionEntries(records),
	{ kind: "texte", label: "Code civil, art. 1240", url: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032041571", status: "En vigueur" },
];
const md = formatBibliography(entries, "markdown", link);
eq("md : sections", md.includes("### Décisions (3)") && md.includes("### Textes (1)"), true);
eq("md : fiche liée", md.includes("- [[Fiches/couiteas1923|Couitéas]] (30/11/1923, Conseil d'État)"), true);

const csv = formatBibliography(entries, "csv").split("\n");
eq("csv : en-tête", csv[0].startsWith("type,libellé,titre"), true);
eq("csv : lignes", csv.length, 5);
eq("csv : guillemets", formatBibliography([{ kind: "texte", label: 'a "b", c' }], "csv").includes('"a ""b"", c"'), true);

const bib = formatBibliography(entries, "bibtex");
eq("bibtex : clef", bib.includes("@misc{Blanco1873,"), true);
eq("bibtex : année et juridiction", bib.includes("year = {1873}") && bib.includes("author = {Tribunal des conflits}"), true);
eq("bibtex : échappement", formatBibliography([{ kind: "texte", label: "A & B_c" }], "bibtex").includes("title = {A \\& B\\_c}"), true);
eq("bibtex : clefs uniques", formatBibliography([{ kind: "texte", label: "X" }, { kind: "texte", label: "X" }], "bibtex").includes("@misc{Xa,"), true);

const ris = formatBibliography(entries, "ris");
eq("ris : type décision", ris.includes("TY  - CASE"), true);
eq("ris : type texte", ris.includes("TY  - STAT"), true);
eq("ris : date", ris.includes("DA  - 1873/02/08/"), true);
eq("ris : fin d'enregistrement", ris.split("ER  - ").length - 1, 4);

// Filtre d'export
eq("filtre par thème", filterDecisions(records, { theme: "Responsabilité de la puissance publique" }).map((r) => r.id), ["blanco", "couiteas"]);
eq("filtre par période", filterDecisions(records, { from: "1900", to: "2000" }).map((r) => r.id), ["couiteas"]);
eq("filtre : une borne écarte les décisions sans date", filterDecisions([...records, rec("sans-date", {})], { from: "1800" }).map((r) => r.id), ["blanco", "couiteas", "cass"]);
eq("filtre vide : tout", filterDecisions(records, {}).length, 3);
eq("filtre actif ?", [isFiltered({}), isFiltered({ to: "2000" })], [false, true]);

// Note d'article
eq("libellé coupé", splitLabel("Code civil, art. 1240"), { text: "Code civil", number: "1240" });
eq("libellé sans article", splitLabel("Préambule de 1946"), { text: "Préambule de 1946", number: "" });
const data = { label: "Code civil, art. 1240", text: "Tout fait quelconque\nde l'homme…", status: "En vigueur", url: "https://exemple/a", decisions: [{ title: "Couitéas", date: "1923-11-30", court: "Conseil d'État", fichePath: "Fiches/couiteas1923.md" }, { title: "Cass.", url: "https://exemple/c" }], notes: ["Cours/responsabilite.md"] };
const note = articleNoteContent(data, link);
eq("note d'article : propriétés", note.startsWith('---\ntype: article\ntexte: "Code civil"\nnumero: "1240"\nstatut: "En vigueur"\nlien: "https://exemple/a"\n---\n\n# Code civil, art. 1240'), true);
eq("note d'article : texte cité entre repères", note.includes("<!-- legifrance:texte -->\n> Tout fait quelconque\n> de l'homme…\n<!-- /legifrance:texte -->"), true);
eq("note d'article : décisions et notes", note.includes("- [[Fiches/couiteas1923|Couitéas]] (30/11/1923, Conseil d'État)") && note.includes("- [Cass.](https://exemple/c)") && note.includes("- [[Cours/responsabilite|responsabilite]]"), true);
eq("note d'article sans texte", articleNoteContent({ label: "X", decisions: [], notes: [] }, link).includes("n'a pas été retrouvé"), true);
eq("propriétés d'un article sans statut", articleProperties({ label: "Code civil, art. 1", decisions: [], notes: [] }), { texte: "Code civil", numero: "1" });

// Mise à jour : seul ce qui est entre repères change ; les remarques de l'utilisateur restent.
const edited = note.replace("## Mes remarques\n\n", "## Mes remarques\n\nÀ relire avant le partiel.\n\n");
const newer = { ...data, status: "Abrogé", text: "Nouveau texte", decisions: [], notes: [] };
const refreshed = refreshArticleContent(edited, newer, link);
eq("mise à jour : remarques conservées", refreshed.includes("À relire avant le partiel."), true);
eq("mise à jour : texte remplacé", refreshed.includes("> Nouveau texte") && !refreshed.includes("Tout fait quelconque"), true);
eq("mise à jour : décisions remplacées", refreshed.includes("Aucune décision de la base") && !refreshed.includes("Couitéas"), true);
eq("mise à jour : idempotente", refreshArticleContent(refreshed, newer, link), refreshed);
eq("mise à jour : repères supprimés, partie non recréée", refreshArticleContent(edited.replace(/<!-- \/?legifrance:decisions -->/g, ""), newer, link).includes("Aucune décision"), false);
eq("mise à jour : note sans repères intacte", refreshArticleContent("Ma note.", newer, link), "Ma note.");

if (fail) { console.log(`${fail} échec(s)`); process.exit(1); }
console.log("tout passe");
