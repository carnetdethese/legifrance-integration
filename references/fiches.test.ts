/** Tests des fiches de décisions. Lancer : `npm test`. */
import { ariaValues, completableCount, courtCode, ficheDifferences, ficheId, ficheQuery, ficheUpdates, isFiche, missingProperties } from "./fiches";
import { decisionKey, legifranceIdOf, spokenDate } from "./ids";
import { datedTextMatches, stripMarks } from "./textMatch";
import { numberSignature } from "./merge";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g !== w) { fail++; console.log("ÉCHEC", name, "\n   obtenu :", g, "\n   attendu:", w); } };

const settings = {
	ficheProperty: "juridiction",
	ficheIdProperty: "legifrance_id",
	ficheOverwrite: false,
	ficheNumberProperty: "numero, décision",
	ficheCitationProperty: "citation",
	ficheNameProperty: "nom",
	ficheMapping: [
		{ property: "date", field: "date" as const },
		{ property: "juridiction", field: "court" as const },
		{ property: "formation", field: "formation" as const },
		{ property: "nom", field: "title" as const },
		{ property: "numero", field: "number" as const },
		{ property: "lien", field: "url" as const },
	],
};

// Fiche typique : identifiant retrouvé dans le lien, propriétés vides à compléter.
const fiche = {
	date: "2021-06-09",
	juridiction: "Conseil d'État",
	formation: "2ème et 7ème sous-sections réunies",
	nom: "Conseil d'État, 7ème - 2ème chambres réunies, 09/06/2021, 448948",
	numero: 448948,
	citation: null,
	lien: "https://www.legifrance.gouv.fr/ceta/id/CETATEXT000043648190",
	contribution: null,
	tags: null,
};
const values = {
	date: "2021-06-09",
	court: "Conseil d'État",
	formation: "2ème - 7ème chambres réunies",
	title: "Conseil d'État, 09/06/2021, 448948",
	number: "448948",
	url: "https://www.legifrance.gouv.fr/ceta/id/CETATEXT000043648190",
};

eq("fiche reconnue", isFiche(fiche, settings), true);
eq("propriété vide mais présente", isFiche({ juridiction: null }, settings), true);
eq("note ordinaire", isFiche({ tags: ["a"] }, settings), false);
eq("sans frontmatter", isFiche(undefined, settings), false);
eq("propriété non définie", isFiche(fiche, { ...settings, ficheProperty: " " }), false);

eq("id depuis le lien", ficheId(fiche, settings), "CETATEXT000043648190");
eq("id depuis sa propriété", ficheId({ legifrance_id: "JURITEXT000012345678", lien: fiche.lien }, settings), "JURITEXT000012345678");
eq("sans identifiant", ficheId({ juridiction: "CE", lien: "https://exemple.fr" }, settings), undefined);
eq("identifiant d'un article refusé", ficheId({ legifrance_id: "LEGIARTI000006419280" }, settings), undefined);

// Fiche complète sauf l'identifiant : seul l'identifiant est ajouté.
eq("rien à compléter hors id", missingProperties(fiche, settings), []);
eq("compte (id seul)", completableCount(fiche, settings), 1);
eq("mise à jour sans écrasement", ficheUpdates(fiche, settings, values, "CETATEXT000043648190"), { legifrance_id: "CETATEXT000043648190" });

// Fiche incomplète : les champs vides sont remplis, les autres conservés.
const partial = { juridiction: "Conseil d'État", formation: "", lien: fiche.lien };
eq("champs manquants", missingProperties(partial, settings).map((m) => m.property), ["date", "formation", "nom", "numero"]);
eq("compte (champs + id)", completableCount(partial, settings), 5);
eq("remplissage", ficheUpdates(partial, settings, values, "CETATEXT000043648190"), {
	legifrance_id: "CETATEXT000043648190",
	date: "2021-06-09",
	formation: "2ème - 7ème chambres réunies",
	nom: "Conseil d'État, 09/06/2021, 448948",
	numero: "448948",
});

// Écrasement demandé : les valeurs de l'API remplacent celles de la fiche, quand elles diffèrent.
eq("écrasement", ficheUpdates(fiche, { ...settings, ficheOverwrite: true }, values, "CETATEXT000043648190"), {
	legifrance_id: "CETATEXT000043648190",
	formation: "2ème - 7ème chambres réunies",
	nom: "Conseil d'État, 09/06/2021, 448948",
	numero: "448948",
});
eq("valeur absente de l'API", ficheUpdates({ juridiction: "" }, settings, {}, "CETATEXT000043648190"), { legifrance_id: "CETATEXT000043648190" });
eq("propriété d'identifiant désactivée", ficheUpdates({}, { ...settings, ficheIdProperty: "" }, { date: "2020-01-01" }, "CETATEXT000043648190"), { date: "2020-01-01" });

// Décisions connues d'ArianeWeb seulement : l'adresse de la page sert de clef.
const aria = "https://www.conseil-etat.fr/fr/arianeweb/CE/decision/1950-07-07/12345";
eq("clef ArianeWeb", decisionKey(`[lien](${aria}?x=1)`), aria);
eq("clef ArianeWeb http", decisionKey("http://conseil-etat.fr/fr/arianeweb/TC/decision/1921-01-22/00706"), "https://www.conseil-etat.fr/fr/arianeweb/TC/decision/1921-01-22/00706");
eq("clef Légifrance prioritaire", decisionKey("https://www.legifrance.gouv.fr/ceta/id/CETATEXT000043648190"), "CETATEXT000043648190");
eq("clef absente", decisionKey("https://exemple.fr/page"), undefined);
eq("id ArianeWeb dans la fiche", ficheId({ juridiction: "Conseil d'État", lien: aria }, settings), aria);
eq("valeurs ArianeWeb", ariaValues(aria), { date: "1950-07-07", court: "Conseil d'État", number: "12345", title: "Conseil d'État, 07/07/1950, n° 12345", url: aria });
eq("valeurs ArianeWeb TC", ariaValues("https://www.conseil-etat.fr/fr/arianeweb/TC/decision/1921-01-22/00706").court, "Tribunal des conflits");
eq("valeurs d'une clef Légifrance", ariaValues("CETATEXT000043648190"), {});
// Un lien ArianeWeb se complète comme un lien Légifrance (date, numéro et juridiction viennent de l'adresse).
eq("complément ArianeWeb", ficheUpdates({ juridiction: "", lien: aria }, settings, ariaValues(aria), aria), {
	legifrance_id: aria, date: "1950-07-07", juridiction: "Conseil d'État", nom: "Conseil d'État, 07/07/1950, n° 12345", numero: "12345",
});

// Recherche d'une fiche sans identifiant.
eq("juridictions", ["Conseil d'État", "Conseil d’État", "CE", "Cour de cassation", "Cass. crim.", "Conseil constitutionnel", "Tribunal des conflits", "Cour d'appel de Paris", 3].map(courtCode), ["ce", "ce", "ce", "cassation", "cassation", "cc", "tc", undefined, undefined]);
eq("requête depuis le frontmatter", ficheQuery({ date: "2021-06-09", juridiction: "Conseil d'État", numero: 448948, nom: " Dehaene " }, settings), { court: "ce", number: "448948", name: "Dehaene", date: "2021-06-09" });
eq("n° et date française", ficheQuery({ numero: "n° 19-12.345", juridiction: "Cour de cassation", date: "09/06/2021" }, settings), { court: "cassation", number: "19-12.345", name: undefined, date: "2021-06-09" });
eq("numéro dans une autre propriété", ficheQuery({ decision: "2018-717/718 QPC", juridiction: "Conseil constitutionnel" }, { ...settings, ficheNumberProperty: "decision" }), { court: "cc", number: "2018-717/718 QPC", name: undefined, date: undefined });
eq("juridiction par la propriété de fiche", ficheQuery({ juridiction: "Conseil constitutionnel" }, { ...settings, ficheMapping: [] }).court, "cc");
eq("fiche vide", ficheQuery({ juridiction: null, numero: null, nom: "" }, settings), { court: undefined, number: undefined, name: undefined, date: undefined });

// Fiche réelle : `numero` vide, numéro dans « décision » ; sans lui, la citation (suffixe inexact) sert de repli.
const ahmed = { date: "2012-01-12", juridiction: "Conseil constitutionnel", nom: "Ahmed S", numero: null, citation: "Cons. constit, 12 janvier 2012 n° 2011-210 DC", "décision": "2011-210 QPC" };
eq("numéro dans la 2e propriété", ficheQuery(ahmed, settings), { court: "cc", number: "2011-210 QPC", name: "Ahmed S", date: "2012-01-12" });
eq("numéro lu dans la citation", ficheQuery({ ...ahmed, "décision": null }, settings), { court: "cc", number: "2011-210 DC", name: "Ahmed S", date: "2012-01-12" });
eq("juridiction tirée de la citation", ficheQuery({ citation: "CE, 9 juin 2021, n° 448948" }, settings), { court: "ce", number: "448948", name: undefined, date: undefined });
eq("sans numéro ni citation", ficheQuery({ juridiction: "Conseil d'État", nom: "Dehaene" }, settings).number, undefined);

// Plusieurs propriétés pour le nom et la citation : la première renseignée l'emporte, avec ou sans espaces.
const multi = { ...settings, ficheNameProperty: "nom, intitule , parties", ficheCitationProperty: "citation,référence" };
eq("nom : 2e propriété", ficheQuery({ juridiction: "CE", nom: "", intitule: "Dehaene" }, multi).name, "Dehaene");
eq("nom : 1re propriété prioritaire", ficheQuery({ juridiction: "CE", nom: "A", intitule: "B" }, multi).name, "A");
eq("nom : 3e propriété", ficheQuery({ juridiction: "CE", parties: "Société X" }, multi).name, "Société X");
eq("citation : 2e propriété", ficheQuery({ "référence": "CE, 9 juin 2021, n° 448948" }, multi).number, "448948");
eq("numéro : propriété inexistante ignorée", ficheQuery({ "décision": "2011-210 QPC" }, { ...settings, ficheNumberProperty: "absent, numero, décision" }).number, "2011-210 QPC");


// Formations : mêmes informations écrites autrement, pas d'écart.
const sameFormation = (a: string, b: string) => ficheDifferences({ formation: a }, settings, { formation: b }).length === 0;
eq("formation : sous-sections et chambres réunies", sameFormation("3ème et 8ème sous-sections réunies", "8ème - 3ème chambres réunies"), true);
eq("formation : sigle SSR", sameFormation("8ème et 10ème sous-sections réunies", "10/ 8 SSR"), true);
eq("formation : ordre des numéros", sameFormation("2ème et 7ème sous-sections réunies", "7ème et 2ème sous-sections réunies"), true);
eq("formation : section", sameFormation("Section", "SECTION DU CONTENTIEUX"), true);
eq("formation : 1ère", sameFormation("1ère et 4ème sous-sections réunies", "4ème - 1ère chambres réunies"), true);
eq("formation : numéros différents", sameFormation("2ème et 7ème sous-sections réunies", "3ème - 7ème chambres réunies"), false);
eq("formation : réunies ou non", sameFormation("2ème sous-section", "2ème et 7ème chambres réunies"), false);
eq("formation : chambre civile", sameFormation("Première chambre civile", "1re chambre civile"), true);
eq("formation : chambres différentes", sameFormation("Chambre criminelle", "Chambre civile"), false);

// Conseil constitutionnel : décisions du Journal officiel et pages du site du Conseil.
import { ccSiteUrl, parseCcSiteKey } from "./ids";
import { ccValues } from "./fiches";
eq("page du site : QPC", ccSiteUrl("2017-670 QPC"), "https://www.conseil-constitutionnel.fr/decision/2017/2017670QPC.htm");
eq("page du site : DC ancienne", ccSiteUrl("71-44 DC"), "https://www.conseil-constitutionnel.fr/decision/1971/7144DC.htm");
eq("page du site : numéro sans type", ccSiteUrl("2017-670"), undefined);
eq("clef : page du site", decisionKey("[décision](https://www.conseil-constitutionnel.fr/decision/2017/2017670QPC.htm?x=1)"), "https://www.conseil-constitutionnel.fr/decision/2017/2017670QPC.htm");
eq("clef : Journal officiel", decisionKey("https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000035922176"), "JORFTEXT000035922176");
eq("numéro depuis la page du site", [parseCcSiteKey("https://www.conseil-constitutionnel.fr/decision/2017/2017670QPC.htm"), parseCcSiteKey("https://www.conseil-constitutionnel.fr/decision/1971/7144DC.htm")], [{ year: 2017, number: "2017-670 QPC" }, { year: 1971, number: "71-44 DC" }]);
eq("valeurs : page du site", ccValues("https://www.conseil-constitutionnel.fr/decision/2017/2017670QPC.htm").number, "2017-670 QPC");
eq("valeurs : Journal officiel", ccValues("JORFTEXT000035922176").url, "https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000035922176");

// Zéros en tête : « 4749 » et « 04749 » sont le même numéro.
eq("numéro à zéros de tête : même numéro", ficheDifferences({ numero: "04749" }, settings, { number: "4749" }), []);
eq("numéro différent signalé", ficheDifferences({ numero: "04749" }, settings, { number: "4750" }).length, 1);
eq("signature à zéros de tête", numberSignature("ce", "04749"), numberSignature("ce", "4749"));
eq("signature : le zéro seul reste", numberSignature("cc", "0"), "cc|0");

// Identifiant d'un texte ou d'un article saisi par l'utilisateur, et date « parlée ».
eq("identifiant d'un lien", legifranceIdOf("https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000886460/"), "JORFTEXT000000886460");
eq("identifiant seul", legifranceIdOf(" LEGIARTI000006419280 "), "LEGIARTI000006419280");
eq("lien sans identifiant", legifranceIdOf("https://www.legifrance.gouv.fr/"), undefined);
eq("date parlée", [spokenDate("1978-01-06"), spokenDate("2016-10-07"), spokenDate("2020-02-29")], ["6 janvier 1978", "7 octobre 2016", "29 février 2020"]);
eq("premier du mois", spokenDate("1978-01-01"), "1er janvier 1978");

// Textes cités par leur date : la nature se compare sans accents, les balises de surlignage sont retirées, les doublons écartés.
const answer = [
	{ titles: [{ id: "LEGITEXT1_01-01-2999", cid: "JORFTEXT000050001", title: "Décret n° 2025-700 du <mark>18 juillet 2025</mark> relatif à la chasse" }] },
	{ titles: [{ id: "X", cid: "JORFTEXT000050002", title: "Décret n° 2025-701 du 18 juillet 2025 portant nomination" }, { id: "Y", cid: "JORFTEXT000050001", title: "Décret n° 2025-700 du 18 juillet 2025 relatif à la chasse" }] },
	{ titles: [{ id: "Z", cid: "JORFTEXT000050003", title: "Arrêté du 18 juillet 2025 fixant…" }, { id: "W", cid: "JORFTEXT000050004", title: "Décret n° 2024-1 du 3 mars 2024" }] },
];
const matches = datedTextMatches(answer, "décret", { day: 18, month: 7, year: 2025 });
eq("décret : deux textes le même jour, sans doublon", matches.map((m) => m.id), ["JORFTEXT000050001", "JORFTEXT000050002"]);
eq("titre sans balises", matches[0].title, "Décret n° 2025-700 du 18 juillet 2025 relatif à la chasse");
eq("un seul texte ce jour-là", datedTextMatches(answer, "arrêté", { day: 18, month: 7, year: 2025 }).length, 1);
eq("autre date : aucun", datedTextMatches(answer, "décret", { day: 1, month: 1, year: 2000 }), []);
eq("balises retirées", stripMarks("Loi n° 2005-102 du <mark>11 février 2005</mark> pour l'égalité"), "Loi n° 2005-102 du 11 février 2005 pour l'égalité");

console.log(fail ? `${fail} échec(s)` : "tout passe");
import { significantWords } from "./dates";
eq("mots des parties : sans « autres »", significantWords("Fédération Force ouvrière Énergie et Mines et autres"), ["federation", "force", "ouvriere", "energie", "mines"]);

// Revue générale du droit.
import { bareCaseNumber, parseRgdTitle } from "./rgdTitle";
eq("titre RGD : Blanco", parseRgdTitle("Tribunal des conflits, 8 février 1873, Blanco, requête numéro 00012, publié au recueil"), { court: "Tribunal des conflits", courtCode: "tc", date: "1873-02-08", name: "Blanco", number: "00012" });
eq("titre RGD : Despujol", parseRgdTitle("Conseil d'Etat, Section, 10 janvier 1930, Sieur Despujol, requête numéro 97263, rec. p. 30."), { court: "Conseil d'Etat, Section", courtCode: "ce", date: "1930-01-10", name: "Sieur Despujol", number: "97263" });
eq("titre RGD : CAA (juridiction hors périmètre)", parseRgdTitle("CAA Bordeaux, 26 octobre 2010, Commune de Billère, requête numéro 10BX00170, inédit au recueil")?.courtCode, undefined);
eq("titre RGD : CJUE", parseRgdTitle("CJUE, 27\u00a0février 2014, Pohotovosť s. r. o. contre Miroslav Vašuta, Aff. n°C-470/12")?.number, "C-470/12");
eq("titre RGD : pas une décision", parseRgdTitle("Les bases fondamentales de la théorie du fait de service"), undefined);
eq("numéros RGD", [bareCaseNumber("00012"), bareCaseNumber("12"), bareCaseNumber("10BX00170")], ["12", "12", "10bx00170"]);
eq("clef RGD", decisionKey("[Blanco](https://www.revuegeneraledudroit.eu/blog/decisions/tribunal-des-conflits-8-fevrier-1873-blanco-numero-00012-publie-au-recueil/?x=1)"), "https://www.revuegeneraledudroit.eu/blog/decisions/tribunal-des-conflits-8-fevrier-1873-blanco-numero-00012-publie-au-recueil/");
eq("clef RGD sans schéma", decisionKey("www.revuegeneraledudroit.eu/blog/decisions/caa-bordeaux-x/"), "https://www.revuegeneraledudroit.eu/blog/decisions/caa-bordeaux-x/");
process.exit(fail ? 1 : 0);
