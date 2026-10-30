/** Tests de la mise en forme et de la recherche dans un texte. Lancer : `npm test`. */
import { findInText, longDate, natureLabel } from "./display";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g !== w) { fail++; console.log("ÉCHEC", name, "\n   obtenu :", g, "\n   attendu:", w); } };

eq("date", longDate("2017-04-07"), "7 avril 2017");
eq("premier du mois", longDate("1978-01-01T00:00:00.000+0000"), "1er janvier 1978");
eq("date absente", longDate(undefined), "");
eq("date illisible", longDate("n'importe quoi"), "n'importe quoi");
eq("nature", natureLabel("LOI_ORGANIQUE"), "Loi organique");
eq("nature accentuée", [natureLabel("ARRETE"), natureLabel("DECRET_LOI"), natureLabel("décret-loi"), natureLabel("Décision")], ["Arrêté", "Décret-loi", "Décret-loi", "Décision"]);
eq("nature vide", natureLabel(null), "");
eq("sans casse ni accents", findInText("Délibérations DÉLIBÉRÉES", "delibere"), [{ start: 14, end: 22 }]);
eq("plusieurs", findInText("a b a b", "a"), [{ start: 0, end: 1 }, { start: 4, end: 5 }]);
eq("accent cherché", findInText("la séance", "séance"), [{ start: 3, end: 9 }]);
eq("recherche vide", findInText("abc", "  "), []);
eq("absent", findInText("abc", "z"), []);

if (fail) { console.log(`${fail} échec(s)`); process.exit(1); }
console.log("affichage : tous les tests passent");
