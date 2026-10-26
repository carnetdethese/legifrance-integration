import { agentSearch } from "api/utilities";
import { resultatsRecherche, resultatsRechercheClass } from "abstracts/searches";
import { removeTags } from "lib/tools";
import { LegalRef } from "./parser";

/** Document Légifrance retrouvé pour une référence. */
export interface ResolvedLink {
	url: string;
	/** Titre du document trouvé, affiché pour que l'utilisateur vérifie la correspondance. */
	titre: string;
}

/**
 * Retrouve via l'API le document correspondant à une référence (recherche
 * exacte de son numéro dans son fond) et renvoie son premier résultat.
 *
 * @returns `null` si la référence n'est pas résoluble ou sans correspondance.
 * @throws Error si l'appel à l'API échoue.
 */
export async function resolveReference(
	agent: agentSearch,
	ref: LegalRef
): Promise<ResolvedLink | null> {
	if (!ref.fond) return null;

	const data = await agent.advanceSearchText<resultatsRecherche>({
		fond: ref.fond,
		recherche: {
			pageSize: 1,
			pageNumber: 1,
			sort: "PERTINENCE",
			typePagination: "DEFAUT",
			filtres: [],
			champs: [
				{
					typeChamp: "ALL",
					operateur: "ET",
					criteres: [
						{
							valeur: ref.query,
							typeRecherche: "EXACTE",
							operateur: "ET",
							proximite: 2,
						},
					],
				},
			],
		},
	});

	const [first] = new resultatsRechercheClass(data).listeResultats();
	return first ? { url: first.lien, titre: removeTags(first.titre) } : null;
}
