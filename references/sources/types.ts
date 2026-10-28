/**
 * Sources où retrouver la décision d'une fiche sans identifiant. Chaque source sait chercher par
 * numéro et/ou par informations (nom, date), puis lire les valeurs de la décision retenue. Pour
 * ajouter une base (Judilibre, droit de l'Union…) : implémenter `DecisionSource`, l'inscrire dans
 * `SOURCES` (index.ts) et apprendre à `decisionKey` (ids.ts) reconnaître son identifiant.
 */
import type { Lane } from "api/rateLimiter";
import type LegifrancePlugin from "main";
import { DecisionQuery, DecisionValues } from "../fiches";

/** Décision proposée à l'utilisateur. */
export interface DecisionCandidate {
	/** Source qui l'a trouvée (`DecisionSource.id`). */
	source: string;
	/** Clef de la décision, conservée dans la fiche (voir `decisionKey`). */
	key: string;
	title: string;
	url: string;
	/** Valeurs déjà connues par la recherche : évite une requête de plus. */
	values?: DecisionValues;
}

export interface DecisionSource {
	id: string;
	label: string;
	/** Peut-on interroger cette source ? (identifiants, juridiction prise en charge) */
	available(plugin: LegifrancePlugin, query: DecisionQuery): boolean;
	byNumber?(plugin: LegifrancePlugin, query: DecisionQuery, lane?: Lane): Promise<DecisionCandidate[]>;
	byInfo?(plugin: LegifrancePlugin, query: DecisionQuery, lane?: Lane): Promise<DecisionCandidate[]>;
	/** Valeurs de la décision `key`, quand la recherche ne les a pas données. */
	values(plugin: LegifrancePlugin, key: string, lane?: Lane): Promise<DecisionValues>;
}
