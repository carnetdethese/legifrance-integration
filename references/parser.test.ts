/**
 * Tests du parser de références. Les cas viennent des tests de Marginalia (`test_legalrefs.py`),
 * complétés par des citations réelles de notes (décisions sans recueil, titres de section).
 * Lancer : `npm test`.
 */
import { parseReferences } from "./parser";
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
]) eq("décision: " + t, parseReferences(t).map((r) => r.data), [{ court, number }]);
for (const [t, name, decided] of [
 ["CE, 7 juillet 1950, Dehaene, Rec., p. 426", "Dehaene", "7 juillet 1950"],
 ["CE, 7 août 1909, Winkell, Rec", "Winkell", "7 août 1909"],
 ["CE, 14 mars 1956, Hublin, Rec., p. 117.", "Hublin", "14 mars 1956"],
 ["CE, Ass., 30 octobre 1998, Sarran, Levacher, Rec. p. 368", "Sarran, Levacher", "30 octobre 1998"],
 ["CE, sect., 6 juin 1958, Syndicat des X, Rec. 123", "Syndicat des X", "6 juin 1958"],
 ["CE, 7 juill. 1950, Dehaene, Lebon 426", "Dehaene", "7 juill. 1950"],
 ["TC, 8 février 1873, Blanco, Rec. 1er suppl. p. 61", "Blanco", "8 février 1873"],
]) { const r = parseReferences(`Voir ${t} et la suite.`); eq("nommée: " + t, r.map((x) => [x.data.name, x.data.decided]), [[name, decided]]); }
eq("doublon numéroté", parseReferences("CE, 3 mars 2020, Société X, n° 423456, Rec. p. 12").map((r) => r.data), [{ court: "ce", number: "423456" }]);
eq("deux décisions", parseReferences("CE, 7 juillet 1950, Dehaene, Rec., p. 426 ; CE, 14 mars 1956, Hublin, Rec., p. 117.").map((r) => r.data.name), ["Dehaene", "Hublin"]);
eq("même décision 2x", parseReferences("CE, 7 juillet 1950, Dehaene, Rec. ; CE, 7 juillet 1950, Dehaene, Rec., p. 426").length, 1);
eq("UE", parseReferences("CJUE, 16 juill. 2020, aff. C-311/18 ; règlement (UE) 2016/679 ; règlement (CE) n° 44/2001 ; directive (UE) 2016/680 ; CELEX:32016R0679").map((r) => r.data), [{ case: "C-311/18" }, { celex: "32016R0679" }, { celex: "32001R0044" }, { celex: "32016L0680" }]);
eq("ECLI", parseReferences("ECLI:FR:CCASS:2021:C100456").map((r) => r.data), [{ court: "ecli", number: "ECLI:FR:CCASS:2021:C100456" }]);

// Décisions citées par leur nom sans recueil, dans un titre de section, avec l'année seule.
eq("titre de section", parseReferences("## Document n° 1 : C.E., 21 décembre 2001, M. Hoffmann - article 34 / 37 - compétence PM").map((r) => r.data), [{ court: "ce", name: "M. Hoffmann", decided: "21 décembre 2001" }]);
eq("année seule", parseReferences("CE, 2006, Ordre des avocats au barreau de Paris").map((r) => r.data), [{ court: "ce", name: "Ordre des avocats au barreau de Paris", decided: "2006" }]);
eq("loi par sa date rattachée", parseReferences("loi n° 78-17 du 6 janvier 1978 ; la loi du 6 janvier 1978").length, 1);
eq("aucune référence", parseReferences("Un passage sans référence, sauf le nombre 2016-1547.").length, 0);
console.log(fail ? `${fail} échec(s)` : "tout passe");
process.exit(fail ? 1 : 0);
