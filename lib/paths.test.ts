/** Tests des noms et chemins sûrs. Lancer : `npm test`. */
import { safeName, safePath, withoutSeparators } from "./paths";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g !== w) { fail++; console.log("ÉCHEC", name, "\n   obtenu :", g, "\n   attendu:", w); } };

eq("nom ordinaire", safeName("Cass. civ. 1re, 3 mars 2020"), "Cass. civ. 1re, 3 mars 2020");
eq("caractères interdits", safeName('a:b*c?d"e<f>g|h#i^j[k]l'), "a b c d e f g h i j k l");
eq("point seul", safeName(".."), "");
eq("séparateur dans un nom", safeName("3/4/2020"), "3 4 2020");
eq("remontée de dossier", safePath("../../etc/passwd"), "etc/passwd");
eq("remontée au milieu", safePath("Notes/../../x"), "Notes/x");
eq("chemin absolu", safePath("/Notes//Cass/"), "Notes/Cass");
eq("antislash", safePath("..\\..\\x"), "x");
eq("racine", safePath("/"), "");
eq("sous-dossier du modèle conservé", safePath("Cass/2020-01-01"), "Cass/2020-01-01");
eq("valeur", withoutSeparators("3/4\\2020"), "3-4-2020");
eq("longueur", safeName("a".repeat(300)).length, 120);

if (fail) { console.log(`${fail} échec(s)`); process.exit(1); }
console.log("paths : tous les tests passent");
