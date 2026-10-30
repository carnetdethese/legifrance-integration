/** Tests des liens des textes de l'API. Lancer : `npm test`. */
import { fixLinks, legifranceTarget, stripLinks } from "./links";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g !== w) { fail++; console.log("ÉCHEC", name, "\n   obtenu :", g, "\n   attendu:", w); } };

const text =
	'secret professionnel dans le respect des articles [226-13](/affichCodeArticle.do?cidTexte=LEGITEXT000006070719&idArticle=LEGIARTI000006417944&dateTexte=&categorieLien=cid "Code pénal - art. 226-13 (V)") et [226-14](/affichCodeArticle.do?cidTexte=LEGITEXT000006070719&idArticle=LEGIARTI000006417946&dateTexte=&categorieLien=cid "Code pénal - art. 226-14 (M)") du code pénal.';
eq("sans liens", stripLinks(text), "secret professionnel dans le respect des articles 226-13 et 226-14 du code pénal.");
eq(
	"liens absolus",
	fixLinks(text),
	"secret professionnel dans le respect des articles [226-13](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006417944) et [226-14](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006417946) du code pénal."
);
eq("texte", fixLinks("[loi](/affichTexte.do?cidTexte=JORFTEXT000000886460&categorieLien=id)"), "[loi](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000000886460)");
eq("lien absolu intact", fixLinks("[a](https://exemple.fr/x)"), "[a](https://exemple.fr/x)");
eq("lien relatif simple", fixLinks("[a](/jorf/id/JORFTEXT000000886460)"), "[a](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000000886460)");

eq("page .do absolue", legifranceTarget("https://www.legifrance.gouv.fr/affichCodeArticle.do?cidTexte=LEGITEXT000006070719&idArticle=LEGIARTI000006417944&dateTexte=&categorieLien=cid"), { id: "LEGIARTI000006417944" });
eq("article de code", legifranceTarget("https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000037825504/2019-06-01"), { id: "LEGIARTI000037825504" });
eq("loi", legifranceTarget("https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000000886460"), { id: "JORFTEXT000000886460" });
eq("décision", legifranceTarget("https://www.legifrance.gouv.fr/ceta/id/CETATEXT000034403591"), { id: "CETATEXT000034403591" });
eq("section de code", legifranceTarget("https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006070719/LEGISCTA000006165313/"), { id: "LEGITEXT000006070719", sectionId: "LEGISCTA000006165313" });
eq("section seule", legifranceTarget("https://www.legifrance.gouv.fr/codes/id/LEGISCTA000006165313"), null);
eq("autre site", legifranceTarget("https://example.com/jorf/id/JORFTEXT000000886460"), null);
eq("site voisin", legifranceTarget("https://legifrance.gouv.fr.evil.com/jorf/id/JORFTEXT000000886460"), null);
eq("page sans document", legifranceTarget("https://www.legifrance.gouv.fr/search/all"), null);
eq("schéma refusé", legifranceTarget("javascript:alert(1)"), null);
eq("relatif", legifranceTarget("/affichTexte.do?cidTexte=JORFTEXT000000886460&categorieLien=id"), { id: "JORFTEXT000000886460" });

if (fail) { console.log(`${fail} échec(s)`); process.exit(1); }
console.log("liens : tous les tests passent");
