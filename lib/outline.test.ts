/** Tests du plan d'un document. Lancer : `npm test`. */
import { withOutline, worthAnOutline } from "./outline";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g !== w) { fail++; console.log("ÉCHEC", name, "\n   obtenu :", g, "\n   attendu:", w); } };

const { html, items } = withOutline('<h2>Livre Ier : A &gt; B</h2><p>x</p><h3 class="a" id="old">Article 1</h3><p>y</p><h3><b>Article 2</b></h3><h2></h2>');
eq("ancres", html, '<h2 id="lf-h-0">Livre Ier : A &gt; B</h2><p>x</p><h3 class="a" id="lf-h-1">Article 1</h3><p>y</p><h3 id="lf-h-2"><b>Article 2</b></h3><h2></h2>');
eq("intertitres", items.map((i) => [i.id, i.level, i.text, i.article]), [["lf-h-0", 2, "Livre Ier : A > B", false], ["lf-h-1", 3, "Article 1", true], ["lf-h-2", 3, "Article 2", true]]);
eq("sans titres", withOutline("<p>a</p>").items, []);
eq("plan utile", worthAnOutline(items), false);
eq("plan utile (sections)", worthAnOutline([1, 2, 3].map((n) => ({ id: `${n}`, level: 2, text: "Titre", article: false }))), true);
eq("plan utile (articles)", worthAnOutline(Array.from({ length: 10 }, (_, n) => ({ id: `${n}`, level: 3, text: "Article", article: true }))), true);

if (fail) { console.log(`${fail} échec(s)`); process.exit(1); }
console.log("plan : tous les tests passent");
