/** Tests des thèmes, de la similarité et des écarts de fiches. Lancer : `npm test`. */
import { extractSummary, extractThemes, solutionFromTitle, topTheme } from "./themes";
import { DecisionFeatures, relatedDecisions, termCounts } from "./similarity";
import { DecisionRecord, betterDate, ccYear, cleanLabel, dateFromLabel, decisionsTable, displayDate, filterRecords, groupByYear, themeCounts } from "./timeline";
import { Signatures, mergeAliases } from "./merge";
import { ficheDifferences, ficheValues } from "./fiches";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g !== w) { fail++; console.log("ÉCHEC", name, "\n   obtenu :", g, "\n   attendu:", w); } };

// Réponses réelles de Légifrance (abrégées).
const ce = [
	{ id: "9A", abstrats: null, resumePrincipal: "135-02-03-03 Contrats passés par une commune…" },
	{ id: "8A", abstrats: "CETAT135-02-03-03 COLLECTIVITÉS TERRITORIALES. COMMUNE. ATTRIBUTIONS. SERVICES COMMUNAUX. - CONTRAT PORTANT SUR L'ENLÈVEMENT DE VÉHICULES - CONCESSION DE SERVICE.<br/>", resumePrincipal: null },
	{ id: "8B", abstrats: "CETAT39-01-03 MARCHÉS ET CONTRATS ADMINISTRATIFS. NOTION DE CONTRAT ADMINISTRATIF. DIVERSES SORTES DE CONTRATS. - CONCESSION DE SERVICE - CONTRAT…", resumePrincipal: null },
];
eq("thèmes CE", extractThemes(ce, "Conseil d'État, 7ème - 2ème chambres réunies, 09/06/2021, 448948"), [
	"Collectivités territoriales > Commune > Attributions > Services communaux",
	"Marchés et contrats administratifs > Notion de contrat administratif > Diverses sortes de contrats",
]);
eq("thème de plus haut niveau", topTheme("Collectivités territoriales > Commune"), "Collectivités territoriales");

// Le titrage de la Cour de cassation est livré sans accents par Légifrance.
const cass = [{ resumePrincipal: "Cassation civil - RESPONSABILITE DU FAIT DES PRODUITS DEFECTUEUX - Producteur -  Responsabilité -  Action en responsabilité extracontractuelle -  Prescription" }];
eq("thèmes Cassation", extractThemes(cass), ["Responsabilite du fait des produits defectueux > Producteur > Responsabilité"]);

const ccTitle = "Décision 2011-210 QPC - 13 janvier 2012 - M. Ahmed S.  [Révocation des fonctions de maire] - Conformité";
eq("thème CC", extractThemes(undefined, ccTitle), ["Révocation des fonctions de maire"]);
eq("solution CC", solutionFromTitle(ccTitle), "Conformité");
eq("solution CC partielle", solutionFromTitle("Décision n° 2019-828/829 QPC - 28 février 2020 - Mme X [Y] - Non conformité partielle"), "Non conformité partielle");
eq("pas de solution hors CC", solutionFromTitle("Conseil d'État, 09/06/2021, 448948"), undefined);
eq("sans rien", extractThemes(null, ""), []);
eq("résumé", extractSummary(ce, ["concession"]), "Contrats passés par une commune… concession");

// Similarité.
const decision = (id: string, text: string, articles: string[], themes: string[], notes: string[]): DecisionFeatures => ({
	id, label: id, terms: termCounts(text), articles: Object.fromEntries(articles.map((a) => [a, a])), themes, notes,
});
eq("termes", Object.keys(termCounts("Les sociétés requérantes demandent l'annulation de la procédure de passation des concessions")).sort(), ["annulation", "concession", "demandent", "passation", "procedure", "requerante", "societe"]);

const target = decision("concession-fourriere", "concession de service enlèvement véhicules abandonnés fourrière rémunération droit exploiter risque exploitation", ["CCP L. 1121-1", "CJA L. 761-1"], ["Marchés et contrats administratifs > Concession"], ["cours-contrats", "td-1"]);
const corpus = [
	target,
	decision("concession-plage", "concession de service plage exploitation rémunération risque exploitation délégation", ["CCP L. 1121-1", "CGCT L. 1411-1", "CJA L. 761-1"], ["Marchés et contrats administratifs > Concession"], ["cours-contrats"]),
	decision("responsabilite-produits", "responsabilité produits défectueux producteur défaut sécurité dommage", ["C. civ. 1245"], ["Responsabilité > Produits"], ["cours-civil"]),
	decision("autre-frais", "frais irrépétibles somme mise à la charge", ["CJA L. 761-1"], ["Procédure"], ["td-2"]),
];
const related = relatedDecisions(target, corpus);
eq("la plus proche", related[0]?.id, "concession-plage");
check(related.every((r) => r.id !== "concession-fourriere"), "la cible est écartée");
check(!related.some((r) => r.id === "responsabilite-produits"), "une décision sans rapport n'est pas proche");
check((related[0]?.reasons ?? []).some((r) => r.startsWith("articles communs : CCP L. 1121-1")), "l'article rare est cité en premier");
check((related[0]?.reasons ?? []).some((r) => r.startsWith("thème : Marchés et contrats administratifs")), "thème commun");
check((related[0]?.reasons ?? []).some((r) => r.includes("citées ensemble dans 1 note")), "co-citation");
check(related[0].score > (related.find((r) => r.id === "autre-frais")?.score ?? 0), "l'article banal (frais) pèse moins");
eq("limite", relatedDecisions(target, corpus, 1).length, 1);
eq("corpus vide", relatedDecisions(target, [target]), []);

// Écarts entre une fiche et Légifrance (cas réel : date décalée d'un jour, suffixe « DC » au lieu de « QPC »).
const fs = {
	ficheProperty: "juridiction", ficheIdProperty: "legifrance_id", ficheOverwrite: false, ficheNumberProperty: "numero", ficheNameProperty: "nom", ficheCitationProperty: "citation",
	ficheMapping: [{ property: "date", field: "date" as const }, { property: "juridiction", field: "court" as const }, { property: "numero", field: "number" as const }, { property: "formation", field: "formation" as const }],
};
eq("écarts", ficheDifferences({ date: "2012-01-12", juridiction: "Conseil Constitutionnel", numero: "n° 2011-210 DC", formation: "" }, fs, { date: "2012-01-13", court: "Conseil constitutionnel", number: "2011-210 QPC", formation: "x" }),
	[{ property: "date", field: "date", current: "2012-01-12", expected: "2012-01-13" }, { property: "numero", field: "number", current: "n° 2011-210 DC", expected: "2011-210 QPC" }]);
eq("aucun écart (casse, accents, ponctuation du numéro)", ficheDifferences({ date: "2021-06-09", juridiction: "conseil d’etat", numero: 448948 }, fs, { date: "2021-06-09", court: "Conseil d'État", number: "448 948" }), []);
eq("propriété vide ignorée", ficheDifferences({ date: null }, fs, { date: "2021-06-09" }), []);

// Chronologie et table des décisions.
const rec = (id: string, date: string | undefined, themes: string[], notes: string[], extra: Partial<DecisionRecord> = {}): DecisionRecord => ({ id, label: id, themes, notes, complete: true, date, ...extra });
const records = [
	rec("b", "2021-06-09", ["Marchés > Concession"], ["cours-contrats"], { court: "Conseil d'État", title: "CE, 9 juin 2021", solution: "Annulation", fichePath: "Fiches/CE 2021.md" }),
	rec("a", "1950-07-07", ["Marchés > Contrats"], ["cours-contrats", "td"], { court: "Conseil d'État", url: "https://exemple.fr/a" }),
	rec("c", "2021", ["Responsabilité > Faute"], ["td"]),
	rec("d", undefined, [], ["td"]),
];
eq("thèmes", themeCounts(records), [["Marchés", 2], ["Responsabilité", 1]]);
eq("filtre thème", filterRecords(records, { theme: "Marchés" }).map((r) => r.id), ["b", "a"]);
eq("filtre note", filterRecords(records, { note: "td" }).map((r) => r.id), ["a", "c", "d"]);
eq("filtre notes admises", filterRecords(records, { notes: new Set(["cours-contrats"]) }).map((r) => r.id), ["b", "a"]);
eq("filtres cumulés", filterRecords(records, { theme: "Marchés", note: "td" }).map((r) => r.id), ["a"]);
const grouped = groupByYear(records);
eq("années", grouped.years.map((y) => [y.year, y.items.map((r) => r.id)]), [["1950", ["a"]], ["2021", ["c", "b"]]]);
eq("sans date", grouped.undated.map((r) => r.id), ["d"]);
eq("dates", [displayDate("2021-06-09"), displayDate("2021-06"), displayDate("2021"), displayDate(undefined)], ["09/06/2021", "06/2021", "2021", ""]);
eq("table", decisionsTable(records.slice(0, 2), (path, alias) => `[[${path.replace(/\.md$/, "")}|${alias}]]`).split("\n"), [
	"| Date | Juridiction | Décision | Thème | Solution |",
	"| --- | --- | --- | --- | --- |",
	"| 07/07/1950 | Conseil d'État | [a](https://exemple.fr/a) | Marchés |  |",
	"| 09/06/2021 | Conseil d'État | [[Fiches/CE 2021|CE, 9 juin 2021]] | Marchés | Annulation |",
]);

eq("année d'après le numéro du CC", ["2018-765 DC", "71-44 DC", "86-217 DC", "2000-433 DC", "12-5 DC", "1900-1", "n° 2018-765", "448948", undefined].map((n) => ccYear(n)), ["2018", "1971", "1986", "2000", undefined, undefined, undefined, undefined, undefined]);

// Années impossibles vues dans le coffre : numéros « L » et fautes de frappe.
eq("années impossibles refusées", ["30-09 L", "54-10 L", "311-12 L", "3012-647 DC", "2211-5 DC", "1900-2 DC", "05-12 DC"].map((n) => ccYear(n)), [undefined, undefined, undefined, undefined, undefined, undefined, undefined]);
eq("années valides", ["59-1 L", "2011-210 QPC", "99-419 DC"].map((n) => ccYear(n)), ["1959", "2011", "1999"]);

// Dates lues dans la citation telle qu'elle est écrite (cas des captures).
eq("libellés propres", [cleanLabel("Cass. 1<sup>re</sup> civ. 5 octobre 1999, arrêt n° 97-15277"), cleanLabel("CE 14 mars 1994, *M<sup>me</sup> Jean*, req. n° 116736")], ["Cass. 1re civ. 5 octobre 1999, arrêt n° 97-15277", "CE 14 mars 1994, Mme Jean, req. n° 116736"]);
eq("dates des libellés", [
	"C.E., 12 février 1960, n° 46922", "Conseil d'État, 26 octobre 2011, n° 317827", "CE 10 juill. 2020, n° 434582", "Conseil d'État, 9 juil. 2010, n° 338977",
	"C.E., 1er avril 2002, n° 443882", "CE, Ass., 20 oct. 1972, n° 78829", "CE 15 nov. 1872, n° 45079", "Cass. 1<sup>re</sup> civ. 5 octobre 1999, arrêt n° 97-15277",
	"CE 14 mars 1994, *M<sup>me</sup> Jean*, req. n° 116736", "CE, 2007, Arcelor", "CE, 12/02/2020, n° 12345", "CETATEXT000007641501", "CE, 5 mars 2090, n° 1",
].map(dateFromLabel), ["1960-02-12", "2011-10-26", "2020-07-10", "2010-07-09", "2002-04-01", "1972-10-20", "1872-11-15", "1999-10-05", "1994-03-14", "2007", "2020-02-12", undefined, undefined]);
eq("date la plus précise", [betterDate("2012", "2012-01-13"), betterDate("2012-01-13", "2012"), betterDate(undefined, "2012"), betterDate("2012-03", "2012")], ["2012-01-13", "2012-01-13", "2012", "2012-03"]);

// Ce que dit une fiche (propriétés de la correspondance).
const mapping = { ...fs, ficheMapping: [{ property: "date", field: "date" as const }, { property: "juridiction", field: "court" as const }, { property: "nom", field: "title" as const }, { property: "numero", field: "number" as const }] };
eq("valeurs d'une fiche", ficheValues({ date: "2007-07-08", juridiction: "Conseil d'État", nom: "CE, 2007, Arcelor", numero: 288, formation: "x" }, mapping), { date: "2007-07-08", court: "Conseil d'État", title: "CE, 2007, Arcelor", number: "288" });
eq("fiche vide", ficheValues({ date: null, nom: "" }, mapping), {});

// Rapprochement des références à la même décision (cas des captures : Labonne, Despujol, Septfonds, Piccoli).
const sig = (numbers: string[], names: [string, string, string][] = []): Signatures => ({ numbers, names: names.map(([group, date, name]) => ({ group, date, name })) });
const rec2 = (id: string, signs: Signatures, extra: Partial<DecisionRecord> = {}): DecisionRecord => ({ id, label: id, themes: [], complete: false, notes: [], signs, ...extra });
const ids = (records: DecisionRecord[]) => records.map((r) => r.id);

const labonne = mergeAliases([
	rec2("nom", sig([], [["ce", "1919-08-08", "labonne"]]), { notes: ["a.md", "b.md"] }),
	rec2("numéro", sig(["ce|56377"], [["ce", "1919-08-08", "labonne"]]), { notes: ["c.md"] }),
	rec2("fiche", sig([], [["ce", "1919-08-08", "labonne"], ["ce", "1919-08-08", "conseil d etat 8 aout 1919 labonne"]]), { notes: ["d.md"], fichePath: "Fiches/Labonne.md" }),
	rec2("année + suite de phrase", sig([], [["ce", "1919", "labonne est fondamental"]]), { notes: ["e.md"] }),
	rec2("fin de phrase", sig([], [["ce", "1919-08-08", "labonne"]]), { notes: ["f.md"] }),
	rec2("autre décision du jour", sig([], [["ce", "1919-08-08", "societe des cartonneries"]])),
]);
eq("Labonne : une décision (nom, numéro, fiche, année seule)", ids(labonne), ["fiche", "autre décision du jour"]);
eq("Labonne : citations et fiche réunies", [labonne[0].notes.length, labonne[0].fichePath], [6, "Fiches/Labonne.md"]);

const despujol = mergeAliases([
	rec2("nom", sig([], [["ce", "1930-01-10", "despujol"]]), { notes: ["a.md"] }),
	rec2("numéro", sig(["ce|97263"], [["ce", "1930-01-10", "despujol"]]), { notes: ["b.md"] }),
	rec2("CETATEXT000007637235", sig(["ce|97263", "ce|05822"]), { notes: ["c.md"], complete: true, title: "Conseil d'Etat, Section, du 10 janvier 1930, 97263 05822, publié au recueil Lebon", themes: ["Procédure"] }),
]);
eq("Despujol : nom, numéro et décision de Légifrance → une seule, celle de Légifrance", [despujol.length, despujol[0].id, despujol[0].notes.length, despujol[0].complete], [1, "CETATEXT000007637235", 3, true]);

eq("Septfonds : CE et TC partagent leur base", ids(mergeAliases([rec2("ce", sig([], [["ce", "1923-06-16", "septfonds"]])), rec2("tc", sig([], [["ce", "1923-06-16", "septfonds"]]))])), ["ce"]);
eq("Piccoli : suffixe de phrase, même jour", ids(mergeAliases([rec2("a", sig([], [["ce", "1923-01-17", "piccoli"]])), rec2("b", sig([], [["ce", "1923-01-17", "piccoli parle de terrains du domaine public"]]))])), ["a"]);
eq("Boyer et Jullian : nom complet contenant le nom court", ids(mergeAliases([rec2("a", sig([], [["ce", "1930-06-30", "boyer et jullian"]])), rec2("b", sig([], [["ce", "1930-06-30", "boyer et jullian c ministre de la guerre"]]))])), ["a"]);
eq("faute de frappe : pas de fusion (Piccoli / Piccioli)", ids(mergeAliases([rec2("a", sig([], [["ce", "1923-01-17", "piccoli"]])), rec2("b", sig([], [["ce", "1923-01-17", "piccioli"]]))])), ["a", "b"]);
eq("jours différents : pas de fusion", ids(mergeAliases([rec2("a", sig([], [["ce", "1942-02-13", "ville de dole"]])), rec2("b", sig([], [["ce", "1942-07-31", "ville de dole"]]))])), ["a", "b"]);
eq("juridictions différentes : pas de fusion", ids(mergeAliases([rec2("a", sig([], [["ce", "1990-01-01", "durand"]])), rec2("b", sig([], [["cassation", "1990-01-01", "durand"]]))])), ["a", "b"]);
eq("numéro identique mais juridiction différente : pas de fusion", ids(mergeAliases([rec2("a", sig(["ce|12345"])), rec2("b", sig(["cassation|12345"]))])), ["a", "b"]);
eq("nom trop court : égalité seulement", ids(mergeAliases([rec2("a", sig([], [["ce", "1990-01-01", "x"]])), rec2("b", sig([], [["ce", "1990-01-01", "x y z"]]))])), ["a", "b"]);
eq("année seule ambiguë : pas de fusion", ids(mergeAliases([rec2("an", sig([], [["ce", "1942", "monpeurt"]])), rec2("j1", sig([], [["ce", "1942-01-01", "monpeurt"]])), rec2("j2", sig([], [["ce", "1942-02-02", "monpeurt"]]))])), ["an", "j1", "j2"]);
eq("sans indices : rien ne bouge", ids(mergeAliases([rec2("a", sig([])), rec2("b", sig([]))])), ["a", "b"]);

function check(ok: boolean, name: string) { if (!ok) { fail++; console.log("ÉCHEC", name); } }

// Rapprochement manuel : deux entrées que rien ne relie automatiquement (nom différent, pas de numéro commun).
const manualA = rec2("Arcelor", sig([], [["ce", "2007-02-08", "arcelor"]]), { notes: ["a.md"], members: ["Arcelor"] });
const manualB = rec2("fiche:Fiches/Gardedieu.md", sig([], []), { notes: ["b.md"], fichePath: "Fiches/Gardedieu.md", members: ["fiche:Fiches/Gardedieu.md"] });
eq("sans rapprochement manuel : deux décisions", ids(mergeAliases([manualA, manualB])), ["Arcelor", "fiche:Fiches/Gardedieu.md"]);
const manualMerged = mergeAliases([{ ...manualA }, { ...manualB }], [["fiche:Fiches/Gardedieu.md", "Arcelor"]]);
eq("rapprochement manuel : la décision conservée absorbe la fiche et les notes", [ids(manualMerged), manualMerged[0].fichePath, manualMerged[0].notes, manualMerged[0].members], [["Arcelor"], "Fiches/Gardedieu.md", ["a.md", "b.md"], ["Arcelor", "fiche:Fiches/Gardedieu.md"]]);
eq("rapprochement manuel : identifiant disparu ignoré", ids(mergeAliases([{ ...manualA }], [["absent", "Arcelor"]])), ["Arcelor"]);

// Suggestions de rapprochement (cas litigieux).
import { suggestMerges } from "./merge";
const pairs = (records: DecisionRecord[], dismissed: [string, string][] = []) => suggestMerges(records, dismissed).map((s) => [s.a.id, s.b.id]);
const typo = [rec2("a", sig([], [["ce", "1923-01-17", "piccoli"]])), rec2("b", sig([], [["ce", "1923-01-17", "piccioli"]]))];
eq("suggestion : faute de frappe le même jour", pairs(typo), [["a", "b"]]);
eq("suggestion écartée", pairs(typo, [["b", "a"]]), []);
eq("suggestion : même nom, dates différentes la même année", pairs([rec2("a", sig([], [["ce", "1942-02-13", "ville de dole"]])), rec2("b", sig([], [["ce", "1942-07-31", "ville de dole"]]))]), [["a", "b"]]);
eq("pas de suggestion : numéros différents", pairs([rec2("a", sig(["ce|1"], [["ce", "1942-02-13", "ville de dole"]])), rec2("b", sig(["ce|2"], [["ce", "1942-07-31", "ville de dole"]]))]), []);
eq("pas de suggestion : noms sans rapport", pairs([rec2("a", sig([], [["ce", "1919-08-08", "labonne"]])), rec2("b", sig([], [["ce", "1919-08-08", "societe des cartonneries"]]))]), []);
eq("pas de suggestion : juridictions différentes", pairs([rec2("a", sig([], [["ce", "1990-01-01", "durand"]])), rec2("b", sig([], [["cassation", "1990-01-01", "durand"]]))]), []);
eq("suggestion : année seule qui convient à deux décisions", pairs([rec2("y", sig([], [["ce", "1942", "ville de dole"]])), rec2("a", sig([], [["ce", "1942-02-13", "ville de dole"]]))]), [["y", "a"]]);

// Noms usuels et noms de fiches.
import { ficheFileName, nameFromNote } from "./timeline";
eq("nom depuis une note", [nameFromNote("couiteas1923"), nameFromNote("communeHyeres1988"), nameFromNote("1923")], ["Couiteas", "Commune Hyeres", undefined]);
eq("nom de fiche", [ficheFileName({ ...rec2("x", sig([])), name: "Couitéas", date: "1923-11-30" }), ficheFileName({ ...rec2("x", sig([])), name: "Commune d'Hyères", date: "1988" }), ficheFileName(rec2("x", sig([])))], ["couiteas1923", "communeDHyeres1988", undefined]);

// Contrôle des citations.
import { citationIssues } from "./checks";
const chk = (extra: object) => ({ key: "k", label: "CE, 1919, Labonne", notes: ["a.md"], ...extra });
const problemsOf = (extra: object) => citationIssues([chk(extra)]).map((i) => i.problems);
eq("date identique", problemsOf({ decided: "8 août 1919", actualDate: "1919-08-08" }), []);
eq("année seule exacte", problemsOf({ decided: "1919", actualDate: "1919-08-08" }), []);
eq("jour différent", problemsOf({ decided: "9 août 1919", actualDate: "1919-08-08" }), [["date citée : 9 août 1919 ; décision du 08/08/1919"]]);
eq("année différente", problemsOf({ decided: "1920", actualDate: "1919-08-08" }), [["date citée : 1920 ; décision du 08/08/1919"]]);
eq("numéro joint", problemsOf({ court: "ce", number: "97263", actualNumber: "97263 05822" }), []);
eq("numéro différent", problemsOf({ court: "ce", number: "97264", actualNumber: "97263 05822" }), [["numéro citée : 97264 ; décision n° 97263 05822".replace("citée", "cité")]]);
eq("zéros de tête", problemsOf({ court: "ce", number: "12", actualNumber: "00012" }), []);
eq("Conseil constitutionnel : type ignoré", problemsOf({ court: "cc", number: "2011-210 DC", actualNumber: "2011-210 QPC" }), []);
eq("rien à comparer", problemsOf({ decided: "1919" }), []);

// Généalogie.
import { decisionRelations, relationsFor, RelationRow } from "./genealogy";
const text = "Considérant que, par sa décision du 8 août 1919, CE, 8 août 1919, Labonne, le Conseil d'État a jugé ce qui suit. Il y a lieu de revenir sur la solution retenue par CE, 10 janvier 1930, Despujol, n° 97263. Ainsi que l'a jugé CE, 13 février 1942, Ville de Dôle, la règle s'applique.";
const relations = decisionRelations(text);
eq("généalogie : trois décisions citées", relations.map((r) => [r.ref.data.name ?? r.ref.data.number, r.kind]), [["Labonne", "cite"], ["Despujol", "renverse"], ["Ville de Dôle", "confirme"]]);
const rowOf = (from: string, kind: RelationRow["kind"], key: string, number: string): RelationRow => ({ from_id: from, to_key: key, to_label: key, to_court: "ce", to_number: number, kind, extract: "…" });
const cible = rec2("CETATEXT1", sig(["ce|97263"], []), { refKeys: ["k-despujol"], members: ["CETATEXT1"], name: "Despujol" });
const source = rec2("CETATEXT2", sig([], []), { members: ["CETATEXT2"], name: "Autre" });
const rows = [rowOf("CETATEXT2", "renverse", "k-x", "97263")];
eq("généalogie : relation entrante par numéro", relationsFor(cible, rows, [cible, source]).incoming.map((i) => [i.kind, i.label]), [["renverse", "Autre"]]);
eq("généalogie : relation sortante résolue", relationsFor(source, rows, [cible, source]).outgoing.map((i) => [i.kind, i.label]), [["renverse", "Despujol"]]);

// Thèmes : codes de nomenclature résiduels et variantes d'un même thème.
import { cleanTheme, themeKey } from "./themes";
eq("thème : code avec renvois RJ", [cleanTheme("Cetat54-06-07-005,rj1,rj2 procedure"), cleanTheme("Cetat60-01-02-02-02,rj1 responsabilite de la puissance publique > Sous-thème")], ["Procedure", "Responsabilite de la puissance publique > Sous-thème"]);
eq("thème : déjà propre", cleanTheme("Actes legislatifs et administratifs"), "Actes legislatifs et administratifs");
eq("clef de thème : accents et casse", themeKey("Responsabilité de la puissance publique") === themeKey("responsabilite de la puissance publique"), true);
const withThemes = (themes: string[]) => ({ ...rec2("t" + themes.join(), sig([])), themes });
eq("thèmes regroupés sous la forme accentuée", themeCounts([withThemes(["Procédure > Référé"]), withThemes(["Procedure"]), withThemes(["Procédure"])]), [["Procédure", 3]]);
eq("filtre par thème insensible aux accents", filterRecords([withThemes(["Procedure"]), withThemes(["Cultes"])], { theme: "Procédure" }).length, 1);
console.log(fail ? `${fail} échec(s)` : "tout passe");
if (fail) process.exit(1);
