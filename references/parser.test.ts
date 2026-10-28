/**
 * Tests du parser de références. Les cas viennent des tests de Marginalia (`test_legalrefs.py`),
 * complétés par des citations réelles de notes (décisions sans recueil, titres de section).
 * Lancer : `npm test`.
 */
import { citationSpans, parseCitations, parseReferences } from "./parser";
const labels = (t: string) => parseReferences(t).map((r) => r.label);
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g !== w) { fail++; console.log("ÉCHEC", name, "\n   obtenu :", g, "\n   attendu:", w); } };
for (const [t, e] of [
 ["art. 1240 C. civ.", ["Code civil, art. 1240"]],
 ["l'article 1240 du Code civil", ["Code civil, art. 1240"]],
 ["article L. 121-1 du code de la consommation", ["Code de la consommation, art. L. 121-1"]],
 ["articles 1240 et 1241 du Code civil", ["Code civil, art. 1240", "Code civil, art. 1241"]],
 ["C. civ., art. 1103-1", ["Code civil, art. 1103-1"]],
 ["art. 6 CPC et art. 12 CP", ["Code de procédure civile, art. 6", "Code pénal, art. 12"]],
 ["art. R. 312-3 CJA", ["Code de justice administrative, art. R. 312-3"]],
 ["article 1240, alinéa 1er, du Code civil", ["Code civil, art. 1240"]],
 ["l'article 61-1 de la Constitution", ["Constitution, art. 61-1"]],
 ["l'article 1er de la Constitution", ["Constitution, art. 1"]],
 ["l'article 16 de la Déclaration de 1789", ["Déclaration des droits de l'homme et du citoyen de 1789, art. 16"]],
 ["l'article 1240 du code", []],
 ["la CP est claire", []],
 ["l'article 4 de la Charte de l'environnement", ["Charte de l'environnement de 2004, art. 4"]],
 ["Charte de l'environnement de 2004, art. 1er", ["Charte de l'environnement de 2004, art. 1"]],
 ["onzième alinéa du Préambule de la Constitution de 1946", ["Préambule de la Constitution de 1946, al. 11"]],
 ["alinéa 11 du Préambule de 1946", ["Préambule de la Constitution de 1946, al. 11"]],
 ["le Préambule de 1946 consacre", ["Préambule de la Constitution de 1946"]],
 ["le Préambule de 1958", []],
 ["Cass. soc., 3 mai 2011, n° 09-67.464 ; art. 1240 C. civ. ; article 1240 du Code civil", ["Cass. soc., 3 mai 2011, n° 09-67.464", "Code civil, art. 1240"]],
 ["décision n° 2012-653 DC du 9 août 2012", ["décision n° 2012-653 DC du 9 août 2012"]],
] as [string, string[]][]) eq("labels: " + t, labels(t), e);
eq("loi+décret", parseReferences("la loi n° 2016-1547 du 18 novembre 2016 et le décret n° 2020-1406").map((r) => [r.kind, r.data]), [["texte", { nature: "loi", number: "2016-1547" }], ["texte", { nature: "décret", number: "2020-1406" }]]);
for (const [t, court, number] of [
 ["Cass. 1re civ., 12 mai 2021, n° 19-12.345", "cassation", "19-12.345"],
 ["Soc. 3 mai 2011, n° 09-67.464", "cassation", "09-67.464"],
 ["Cass. crim., 5 janv. 2022, pourvoi n° 20-86 123", "cassation", "20-86.123"],
 ["CE, Sect., 3 mars 2020, Société X, n° 423456", "ce", "423456"],
 ["Conseil d'État, 10 mars 2020, n° 1234567", "ce", "1234567"],
 ["Cons. const., 28 févr. 2020, n° 2019-828/829 QPC", "cc", "2019-828/829 QPC"],
 ["décision n° 2012-653 DC du 9 août 2012", "cc", "2012-653 DC"],
 ["décision 94-359 DC", "cc", "94-359 DC"],
]) eq("décision: " + t, parseReferences(t).map((r) => ({ court: r.data.court, number: r.data.number })), [{ court, number }]);
for (const [t, name, decided] of [
 ["CE, 7 juillet 1950, Dehaene, Rec., p. 426", "Dehaene", "1950-07-07"],
 ["CE, 7 août 1909, Winkell, Rec", "Winkell", "1909-08-07"],
 ["CE, 14 mars 1956, Hublin, Rec., p. 117.", "Hublin", "1956-03-14"],
 ["CE, Ass., 30 octobre 1998, Sarran, Levacher, Rec. p. 368", "Sarran, Levacher", "1998-10-30"],
 ["CE, sect., 6 juin 1958, Syndicat des X, Rec. 123", "Syndicat des X", "1958-06-06"],
 ["CE, 7 juill. 1950, Dehaene, Lebon 426", "Dehaene", "1950-07-07"],
 ["TC, 8 février 1873, Blanco, Rec. 1er suppl. p. 61", "Blanco", "1873-02-08"],
]) { const r = parseReferences(`Voir ${t} et la suite.`); eq("nommée: " + t, r.map((x) => [x.data.name, x.data.decided]), [[name, decided]]); }
eq("doublon numéroté", parseReferences("CE, 3 mars 2020, Société X, n° 423456, Rec. p. 12").map((r) => r.data), [{ court: "ce", number: "423456", name: "Société X", decided: "2020-03-03" }]);
eq("deux décisions", parseReferences("CE, 7 juillet 1950, Dehaene, Rec., p. 426 ; CE, 14 mars 1956, Hublin, Rec., p. 117.").map((r) => r.data.name), ["Dehaene", "Hublin"]);
eq("même décision 2x", parseReferences("CE, 7 juillet 1950, Dehaene, Rec. ; CE, 7 juillet 1950, Dehaene, Rec., p. 426").length, 1);
eq("UE", parseReferences("CJUE, 16 juill. 2020, aff. C-311/18 ; règlement (UE) 2016/679 ; règlement (CE) n° 44/2001 ; directive (UE) 2016/680 ; CELEX:32016R0679").map((r) => r.data), [{ case: "C-311/18" }, { celex: "32016R0679" }, { celex: "32001R0044" }, { celex: "32016L0680" }]);
eq("ECLI", parseReferences("ECLI:FR:CCASS:2021:C100456").map((r) => r.data), [{ court: "ecli", number: "ECLI:FR:CCASS:2021:C100456" }]);

// « CPCE » : Code des postes (articles à 1-2 chiffres) ou Code des procédures civiles d'exécution (3 chiffres).
eq("CPCE postes", labels("Art. L 33-1 CPCE ; art. L. 34-11 CPCE ; art. L. 130 CPCE"), ["Code des postes et des communications électroniques, art. L. 33-1", "Code des postes et des communications électroniques, art. L. 34-11", "Code des postes et des communications électroniques, art. L. 130"]);
eq("CPCE exécution", labels("art. L. 111-1 CPCE ; art. R. 121-1 CPCE ; C. pr. exéc., art. L. 211-1"), ["Code des procédures civiles d'exécution, art. L. 111-1", "Code des procédures civiles d'exécution, art. R. 121-1", "Code des procédures civiles d'exécution, art. L. 211-1"]);
eq("code des postes en toutes lettres", labels("l'article L. 33-1 du code des postes"), ["Code des postes et des communications électroniques, art. L. 33-1"]);

// Législation de l'Union : article d'un texte désigné par son sigle, son nom ou son numéro.
eq("RGPD", labels("Art. 32 RGPD ; article 6, § 1, du règlement (UE) 2016/679 ; RGPD, art. 5 ; art. 267 TFUE ; art. 2 TUE ; l'article 47 de la Charte des droits fondamentaux de l'Union européenne ; article 17 du règlement général sur la protection des données"),
	["RGPD, art. 32", "RGPD, art. 6", "RGPD, art. 5", "TFUE, art. 267", "TUE, art. 2", "Charte des droits fondamentaux de l'UE, art. 47", "RGPD, art. 17"]);
eq("règlement (UE) non listé", labels("art. 3 du règlement (UE) 2019/1020"), ["règlement (UE) 2019/1020, art. 3"]);
eq("Charte de l'environnement inchangée", labels("l'article 4 de la Charte de l'environnement"), ["Charte de l'environnement de 2004, art. 4"]);
eq("aucun faux positif : « la tue » et un article sans texte", labels("la tue ; art. 32 de la loi"), []);
eq("un sigle seul est une mention du texte", labels("une DSA"), ["DSA"]);

// Décisions citées par leur nom sans recueil, dans un titre de section, avec l'année seule.
eq("titre de section", parseReferences("## Document n° 1 : C.E., 21 décembre 2001, M. Hoffmann - article 34 / 37 - compétence PM").map((r) => r.data), [{ court: "ce", name: "M. Hoffmann", decided: "2001-12-21" }]);
eq("année seule", parseReferences("CE, 2006, Ordre des avocats au barreau de Paris").map((r) => r.data), [{ court: "ce", name: "Ordre des avocats au barreau de Paris", decided: "2006" }]);
eq("loi par sa date rattachée", parseReferences("loi n° 78-17 du 6 janvier 1978 ; la loi du 6 janvier 1978").length, 1);
eq("aucune référence", parseReferences("Un passage sans référence, sauf le nombre 2016-1547.").length, 0);
// Une même décision citée de plusieurs façons : liens internes, ponctuation, date abrégée → une seule clef.
const keyOf = (t: string) => parseReferences(t).filter((r) => r.kind === "decision").map((r) => r.key);
const monpeurt = keyOf("CE, 31 juillet 1942, Monpeurt");
eq("une clef", monpeurt.length, 1);
for (const [name, text] of [
	["point final", "C.E., assemblée., 31 juillet 1942, Monpeurt."],
	["date abrégée", "CE, 31 juill. 1942, Monpeurt"],
	["lien interne", "voir [[CE, 31 juillet 1942, Monpeurt]] pour la suite"],
	["lien interne et ponctuation", "[[CE, Ass., 31 juillet 1942, Monpeurt]]."],
	["lien avec alias", "[[Fiches/CE Monpeurt#Cité|CE, 31 juillet 1942, Monpeurt]]"],
	["crochets orphelins", "CE, 31 juillet 1942, Monpeurt]]"],
	["suite de phrase après =", "[[CE, 31 juillet 1942, Monpeurt]] = « bien que le législateur n'en ait pas fait de"],
	["casse et accents", "CE, 31 juillet 1942, MONPEURT"],
	["gras", "CE, 31 juillet 1942, *Monpeurt*"],
] as [string, string][]) eq(`même décision : ${name}`, keyOf(text), monpeurt);
eq("nom sans reste de phrase", parseReferences("[[CE, Ass., 1942, Montpeurt]] = « bien que le législateur n'en ait pas fait de").map((r) => r.data), [{ court: "ce", name: "Montpeurt", decided: "1942" }]);
eq("nom sans crochets ni point", parseReferences("CE, Ass., 2 avril 1943, Bouguen]].").map((r) => [r.label, r.data]), [["CE, Ass., 2 avril 1943, Bouguen", { court: "ce", name: "Bouguen", decided: "1943-04-02" }]]);
eq("dates distinctes, décisions distinctes", new Set([...keyOf("CE, 13 février 1942, Ville de Dôle"), ...keyOf("CE, 31 juillet 1942, Ville de Dôle")]).size, 2);
eq("mois et année", parseReferences("CE, juin 1950, Quéméneur").map((r) => r.data.decided), ["1950-06"]);

// Titres de notes et de sections : « décision : sujet », renvoi de page, nom tronqué à 60 caractères.
const camino = keyOf("CE, 14 janvier 1916, Camino");
eq("Camino : une clef", camino.length, 1);
for (const [name, text] of [
	["sous-titre", "CE, 14 janvier 1916, Camino : contrôle de l'exactitude matérielle des faits"],
	["sous-titre long", "CE, 14 janvier 1916, Camino : L'administration considère que l'administré ne reçoit pas de réponse"],
	["sous-titre sans espace avant", "CE, 14 janvier 1916, Camino: l'erreur dans l'exactitude matérielle des faits"],
	["renvoi de page", "CE, 14 janvier 1916, Camino p. 15"],
	["renvoi de page sans espace", "CE, 14 janvier 1916, Camino p.15"],
	["lien et sous-titre", "[[CE, 14 janvier 1916, Camino : contrôle des faits]]"],
] as [string, string][]) eq(`même décision : ${name}`, keyOf(text), camino);
eq("numéro cité : la décision est identifiée par son numéro", keyOf("CE, 14 janvier 1916, Camino n° 59619"), ["decision|court=ce|number=59619"]);
eq("nom long conservé en entier", parseReferences("CE, 30 mars 1916, Compagnie générale d'éclairage de Bordeaux : hausse du prix du gaz").map((r) => r.data.name), ["Compagnie générale d'éclairage de Bordeaux"]);
eq("nom avec point (initiale)", parseReferences("CE, 21 décembre 2001, M. Hoffmann : liberté").map((r) => r.data.name), ["M. Hoffmann"]);
eq("décisions différentes le même jour", new Set([...keyOf("CE, 30 mars 1916, Compagnie générale d'éclairage de Bordeaux"), ...keyOf("CE, 30 mars 1916, Camino")]).size, 2);

// Fin de phrase, noms tronqués, et indices d'une citation par numéro.
eq("fin de phrase", parseReferences("CE 8 août 1919, Labonne. On fait la suite").map((r) => [r.label, r.data.name]), [["CE 8 août 1919, Labonne", "Labonne"]]);
eq("fin de phrase : Rec sans virgule", parseReferences("CE, Section, 28 février 1930, Sieur Remoux. Rec").map((r) => r.data.name), ["Sieur Remoux"]);
eq("abréviations conservées", parseReferences("CE, 21 décembre 2001, Mme. Dupont et M. Durand").map((r) => r.data.name), ["Mme. Dupont et M. Durand"]);
eq("nom long (>60 car.)", parseReferences("CE, 16 juin 1922, Compagnie générale des eaux c/ ministre de la marine et de la marchande").map((r) => r.data.name), ["Compagnie générale des eaux c/ ministre de la marine et de la marchande"]);
const despujol = parseReferences("CE, Section, 10 janvier 1930, Despujol, n° 97263");
eq("numéro : indices nom et date", despujol.map((r) => r.data), [{ court: "ce", number: "97263", name: "Despujol", decided: "1930-01-10" }]);
eq("numéro : la clef ne dépend pas des indices", despujol[0].key === parseReferences("CE, n° 97263")[0].key, true);
eq("numéro sans nom : pas d'indices", parseReferences("CE, 10 janvier 1930, n° 97263").map((r) => r.data), [{ court: "ce", number: "97263" }]);

// Deux citations qui se suivent : aucune ne déborde sur l'autre (le numéro de la seconde ne reçoit pas le nom de la première).
const deux = parseReferences("CE, 8 août 1919, Labonne et CE, Section, 10 janvier 1930, Despujol, n° 97263");
eq("deux citations : chacune la sienne", deux.map((r) => r.data), [{ court: "ce", name: "Labonne", decided: "1919-08-08" }, { court: "ce", number: "97263", name: "Despujol", decided: "1930-01-10" }]);
eq("deux citations : TC puis CE", parseReferences("CE, 16 juin 1923, Septfonds et TC, 16 juin 1923, Septfonds").map((r) => r.data), [{ court: "ce", name: "Septfonds", decided: "1923-06-16" }, { court: "tc", name: "Septfonds", decided: "1923-06-16" }]);
eq("nom avec « et » conservé", parseReferences("CE, 30 juin 1930, Boyer et Jullian").map((r) => r.data.name), ["Boyer et Jullian"]);

// Plages des citations (surlignage dans le panneau des mentions).
const phrase = "Voir CE, 8 février 2007, Arcelor, et l'art. 1240 du Code civil.";
eq("plages : le texte de la plage est la citation", citationSpans(phrase).map((s) => phrase.slice(s.start, s.end)), ["CE, 8 février 2007, Arcelor", "art. 1240 du Code civil"]);

// Conseil constitutionnel cité par sa date : toutes les désignations usuelles donnent la même référence.
for (const court of ["Cons. constit.", "Cons. const.", "C.C.", "CC", "Conseil constitutionnel"]) {
	const r = parseReferences(`Voir ${court}, 16 juillet 1971, sur la liberté d'association.`);
	eq(`CC par la date : ${court}`, r.map((x) => x.data), [{ court: "cc", decided: "1971-07-16" }]);
}
eq("CC par la date : clef", parseReferences("CC, 16 juillet 1971")[0].key, "decision|court=cc|decided=1971-07-16");
eq("CC par la date : mois abrégé", parseReferences("Cons. constit., 16 juill. 1971")[0].data, { court: "cc", decided: "1971-07-16" });
eq("CC par la date : « décision du »", parseReferences("Conseil constitutionnel, décision du 16 juillet 1971")[0].data, { court: "cc", decided: "1971-07-16" });
eq("CC avec numéro : une seule référence, par le numéro", parseReferences("Cons. const., 16 juillet 1971, n° 71-44 DC").map((x) => x.data), [{ court: "cc", number: "71-44 DC" }]);
eq("CC par la date : deux citations", parseReferences("CC, 16 juillet 1971 puis Cons. constit., 23 août 1985").map((x) => x.data.decided), ["1971-07-16", "1985-08-23"]);
eq("« cc » sans date n'est pas une décision", parseReferences("envoyer en cc le dossier"), []);
eq("« CC » seul avec une date étrangère", parseReferences("Le CC est applicable. Rendez-vous le 3 mai 2024.").length, 0);

// Une date écrite AAAA-MM-JJ n'est pas un numéro de décision (« 01-01 L » dans « 2001-01-01 L'article… »).
for (const text of ["Le 2023-07-02 L'article 3 est entré en vigueur.", "du 2001-01-01 L’adoption", "2002-02-15 Loi du jour", "2003-06-02 Dans le cas", "daté du 2023-07-02 D’après"]) {
	eq(`date ISO non parsée : ${text}`, parseReferences(text), []);
}
eq("numéro de décision réel après une date", parseReferences("Le 2010-05-28 Décision n° 2010-1 QPC").map((r) => r.label), ["Décision n° 2010-1 QPC"]);
eq("numéros réels conservés", parseReferences("Cons. const., n° 2011-210 QPC, et la décision n° 71-44 DC, et 2012-647 DC.").map((r) => r.data.number), ["2011-210 QPC", "71-44 DC", "2012-647 DC"]);
eq("délégalisation conservée", parseReferences("Décision n° 2005-202 L").map((r) => r.data.number), ["2005-202 L"]);

// Textes cités par leur nom usuel, sans article ni numéro (extraits de notes réelles).
const lil = parseReferences("La Loi informatique et libertés du 6 janv 1978 :");
eq("loi Informatique et Libertés avec sa date", lil.map((r) => [r.kind, r.data, r.label]), [["texte", { nature: "loi", number: "78-17" }, "Loi informatique et libertés du 6 janv 1978"]]);
eq("loi Informatique et Libertés sans date", parseReferences("la loi Informatique et Libertés").map((r) => r.data), [{ nature: "loi", number: "78-17" }]);
eq("même clef que la citation par le numéro", parseReferences("loi informatique et libertés")[0].key, parseReferences("loi n° 78-17 du 6 janvier 1978")[0].key);
eq("loi pour la Confiance dans l'Economie Numérique", parseReferences("Loi de 2004, Loi pour la Confiance dans l'Economie Numérique (v. décision)").map((r) => r.data), [{ nature: "loi", number: "2004-575" }]);
eq("LCEN", parseReferences("la LCEN prévoit").map((r) => r.data), [{ nature: "loi", number: "2004-575" }]);
eq("apostrophe typographique", parseReferences("loi pour la confiance dans l’économie numérique").map((r) => r.data.number), ["2004-575"]);
eq("décret « le » une date", parseReferences("Décret le 14 octobre 1991 qui précise les conditions").map((r) => r.data), [{ nature: "décret", date: "14 octobre 1991" }]);
eq("décret « du » une date inchangé", parseReferences("le décret du 14 octobre 1991").map((r) => r.data), [{ nature: "décret", date: "14 octobre 1991" }]);
eq("directive à l'ancienne", parseReferences("transposition de la directive 95/46/CE sur la protection").map((r) => [r.kind, r.data, r.label]), [["eu", { celex: "31995L0046" }, "directive 95/46/CE"]]);
eq("directive 2002/58/CE", parseReferences("directive 2002/58/CE").map((r) => r.data.celex), ["32002L0058"]);
eq("directive ePrivacy (2002)", parseReferences("Directive ePrivacy (2002)").map((r) => [r.data.celex, r.label]), [["32002L0058", "Directive ePrivacy"]]);
const mentions = parseReferences("RGPD (2016, applicable 2018)\nDSA - Digital Services Act (2022)\nDMA - Digital Markets Act (2022)");
eq("RGPD, DSA, DMA par leur nom", mentions.map((r) => [r.label, r.data.celex]), [["RGPD", "32016R0679"], ["DSA", "32022R2065"], ["DMA", "32022R1925"]]);
eq("DSA et son nom : une seule référence, citée deux fois", parseCitations("DSA - Digital Services Act").map((c) => [c.ref.label, c.count]), [["DSA", 2]]);
eq("article du RGPD : une seule référence", labels("art. 32 RGPD"), ["RGPD, art. 32"]);
eq("mention d'un texte de l'Union : adresse EUR-Lex", parseReferences("le RGPD")[0].url, "https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32016R0679");
// Page du Conseil constitutionnel citée par son adresse.
eq("adresse d'une décision du Conseil constitutionnel", parseReferences("[décision du Conseil constitutionnel](https://www.conseil-constitutionnel.fr/decision/2004/2004499DC.htm)").map((r) => [r.kind, r.data]), [["decision", { court: "cc", number: "2004-499 DC" }]]);
eq("adresse d'une QPC", parseReferences("http://www.conseil-constitutionnel.fr/decision/2020/2020841QPC.htm").map((r) => r.data.number), ["2020-841 QPC"]);
eq("adresse : même clef que la citation par le numéro", parseReferences("https://www.conseil-constitutionnel.fr/decision/2004/2004499DC.htm")[0].key, parseReferences("décision n° 2004-499 DC")[0].key);

eq("sigles ambigus : pas seuls", labels("la DGA et le RIA"), []);
eq("sigles ambigus : avec un article", labels("art. 5 RIA").length, 1);

console.log(fail ? `${fail} échec(s)` : "tout passe");
process.exit(fail ? 1 : 0);
