/** Test de l'extrait où une décision cite un article. Lancer : `npm test`. */
import { citingSentence } from "./excerpts";
import { parseCitations } from "./parser";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g !== w) { fail++; console.log("ÉCHEC", name, "\n   obtenu :", g, "\n   attendu:", w); } };

const text = "Faits et procédure. Selon l'arrêt attaqué (Cass. civ. 1re, 4 juin 2025), la société a été condamnée.\n\nAux termes de l'article 1240 du code civil, tout fait quelconque de l'homme, qui cause à autrui un dommage, oblige celui par la faute duquel il est arrivé à le réparer. La cour d'appel a donc statué.";
const key = parseCitations(text).find(({ ref }) => ref.kind === "article")!.ref.key;

const found = citingSentence(text, key)!;
eq("citation", found.cited, "article 1240 du code civil");
eq("début de phrase", found.before, "Aux termes de l'");
eq("fin de phrase", found.after.endsWith("à le réparer."), true);
eq("la phrase suivante n'y est pas", found.after.includes("La cour d'appel"), false);

// Une abréviation (« Cass. ») ne termine pas la phrase.
const abbreviated = "Il a été jugé (Cass. civ. 1re, 4 juin 2025) que l'article 1240 du code civil s'applique.";
const key2 = parseCitations(abbreviated).find(({ ref }) => ref.kind === "article")!.ref.key;
eq("abréviation", citingSentence(abbreviated, key2)!.before.startsWith("Il a été jugé (Cass. civ."), true);

eq("article absent", citingSentence("Rien à voir.", key), undefined);

const long = `${"mot ".repeat(200)}vu l'article 1240 du code civil ${"suite ".repeat(200)}`;
const cut = citingSentence(long, parseCitations(long)[0].ref.key)!;
eq("contexte borné", cut.before.length <= 190 && cut.after.length <= 230, true);

if (fail) { console.log(`${fail} échec(s)`); process.exit(1); }
console.log("tout passe");
