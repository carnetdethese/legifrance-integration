/** Tests de la reconnaissance des notes existantes d'un document. Lancer : `npm test`. */
import type { LegalDocument } from "abstracts/document";
import { mayBeFicheOf, mentionsId, valuesOfDocument } from "./existing";

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
		{ property: "nom", field: "title" as const },
		{ property: "numero", field: "number" as const },
		{ property: "lien", field: "url" as const },
	],
};
const data = { id: "JURITEXT000012345678", type: "jurisprudence", titre: "<b>Cour</b> de cassation", date: "2020-03-04", juridiction: "Cour de cassation", numero: "19-12.345", lien: "https://www.legifrance.gouv.fr/juri/id/JURITEXT000012345678" } as LegalDocument;

eq("id dans le lien", mentionsId({ lien: data.lien }, data.id), true);
eq("id dans une liste", mentionsId({ liens: ["x", `y/${data.id}`] }, data.id), true);
eq("autre id", mentionsId({ lien: "…/JURITEXT000099999999" }, data.id), false);
eq("sans propriétés", mentionsId(undefined, data.id), false);

eq("même numéro, sans id", mayBeFicheOf({ juridiction: "Cour de cassation", numero: "1912345" }, settings, data), true);
eq("même numéro, autre juridiction", mayBeFicheOf({ juridiction: "Conseil d'État", numero: "19-12.345" }, settings, data), false);
eq("autre numéro", mayBeFicheOf({ juridiction: "Cour de cassation", numero: "19-99.999" }, settings, data), false);
eq("déjà liée à une autre décision", mayBeFicheOf({ juridiction: "Cour de cassation", numero: "19-12.345", legifrance_id: "JURITEXT000099999999" }, settings, data), false);
eq("pas une fiche", mayBeFicheOf({ numero: "19-12.345" }, settings, data), false);
eq("même date et même nom", mayBeFicheOf({ juridiction: "Cour de cassation", nom: "Cour de Cassation", date: "2020-03-04" }, settings, data), true);

eq("valeurs", valuesOfDocument(data), { date: "2020-03-04", court: "Cour de cassation", title: "Cour de cassation", number: "19-12.345", url: data.lien });

if (fail) { console.log(`${fail} échec(s)`); process.exit(1); }
console.log("existing : tous les tests passent");
