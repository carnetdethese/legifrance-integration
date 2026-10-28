/** Test des versions d'un article et de la version en vigueur à une date. Lancer : `npm test`. */
import { dayRange, parseVersions, versionAt } from "./versions";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g !== w) { fail++; console.log("ÉCHEC", name, "\n   obtenu :", g, "\n   attendu:", w); } };

// Réponse (abrégée) de l'API pour l'article 1240 du Code civil : l'ancienne version (1804-2016), puis la version actuelle.
const response = {
	article: {
		articleVersions: [
			{ id: "LEGIARTI000032041571", etat: "VIGUEUR", version: "2.0", dateDebut: 1475280000000, dateFin: 32472144000000 },
			{ id: "LEGIARTI000006437044", etat: "MODIFIE", version: "1.0", dateDebut: -5231606400000, dateFin: 1475280000000 },
		],
	},
};
const versions = parseVersions(response);
eq("versions triées, dates lisibles, fin ouverte", versions, [
	{ id: "LEGIARTI000006437044", status: "MODIFIE", start: "1804-03-21", end: "2016-10-01", version: "1.0" },
	{ id: "LEGIARTI000032041571", status: "VIGUEUR", start: "2016-10-01", end: null, version: "2.0" },
]);
eq("réponse sans versions", parseVersions({ article: {} }), []);
eq("réponse à la racine", parseVersions({ articleVersions: [{ id: "A", etat: "VIGUEUR", dateDebut: 0, dateFin: 32472144000000 }] }).length, 1);
eq("élément sans identifiant ignoré", parseVersions({ articleVersions: [{ etat: "VIGUEUR" }, null] }), []);

eq("jour", dayRange("2016-09-30"), ["2016-09-30", "2016-09-30"]);
eq("mois (février bissextile)", dayRange("2020-02"), ["2020-02-01", "2020-02-29"]);
eq("année", dayRange("1923"), ["1923-01-01", "1923-12-31"]);
eq("date illisible", dayRange("bientôt"), null);

const at = (date: string) => versionAt(versions, date);
eq("avant la réforme : ancienne version", [at("2015-06-12").state, at("2015-06-12").version?.id], ["exact", "LEGIARTI000006437044"]);
eq("veille de la réforme", at("2016-09-30").version?.id, "LEGIARTI000006437044");
eq("jour de la réforme : nouvelle version (fin exclue, début inclus)", at("2016-10-01").version?.id, "LEGIARTI000032041571");
eq("après la réforme", [at("2021-06-09").state, at("2021-06-09").version?.id], ["exact", "LEGIARTI000032041571"]);
eq("année sans changement : exacte", [at("1923").state, at("1923").version?.id], ["exact", "LEGIARTI000006437044"]);
eq("année de la réforme : ambiguë, deux versions", [at("2016").state, at("2016").candidates.length, at("2016").version?.id], ["ambiguous", 2, "LEGIARTI000032041571"]);
eq("mois avant la réforme : exact", at("2016-09").state, "exact");
eq("octobre 2016 : seule la nouvelle version couvre le mois", at("2016-10").state, "exact");
// Une réforme au milieu d'un mois : le mois est ambigu, chaque jour est exact.
const mid = [{ id: "A", status: "MODIFIE", start: "2000-01-01", end: "2016-10-15" }, { id: "B", status: "VIGUEUR", start: "2016-10-15", end: null }];
eq("mois contenant la réforme : ambigu", versionAt(mid, "2016-10").state, "ambiguous");
eq("jour avant, jour de la réforme", [versionAt(mid, "2016-10-14").version?.id, versionAt(mid, "2016-10-15").version?.id], ["A", "B"]);
const before = at("1700-01-01");
eq("avant l'existence de l'article", [before.state, before.reason], ["none", "L'article n'existe que depuis le 1804-03-21."]);
eq("date illisible : aucune version", versionAt(versions, "?").state, "none");
eq("article sans versions", versionAt([], "2020-01-01").state, "none");
eq("lacune", versionAt([{ id: "A", status: "ABROGE", start: "1990-01-01", end: "2000-01-01" }, { id: "B", status: "VIGUEUR", start: "2010-01-01", end: null }], "2005-05-05").state, "none");
console.log(fail ? `${fail} échec(s)` : "tout passe");
process.exit(fail ? 1 : 0);
