import { useState } from "react";
import { natureLabel } from "lib/display";
import { statusLabel } from "references/corpus";

/** Facette telle que l'API la renvoie avec les résultats : son nom et l'effectif de chaque valeur. */
export interface Facet {
	facetElem: string;
	values?: Record<string, number>;
}

/** Nom lisible d'une facette ; les autres sont montrées d'après leur nom de l'API. */
const FACET_LABELS: Record<string, string> = {
	NATURE: "Nature",
	TEXT_NATURE: "Nature",
	TEXT_LEGAL_STATUS: "État du texte",
	ARTICLE_LEGAL_STATUS: "État des articles",
	NOM_CODE: "Code",
	JURIDICTION_JUDICIAIRE: "Juridiction",
	JURIDICTION_ADMINISTRATIVE: "Juridiction",
	FORMATION: "Formation",
	SOLUTION: "Solution",
	EMETTEUR: "Émetteur",
	AUTORITE: "Autorité",
	THEME: "Thème",
};

/** Facettes qui n'aident pas à affiner : `FOND` donne l'effectif de tout le fonds, pas celui de la recherche. */
const HIDDEN = new Set(["FOND"]);

const facetLabel = (facette: string) => FACET_LABELS[facette] ?? natureLabel(facette);

/** Libellé d'une valeur : nature et état en français, les autres (nom de code, juridiction…) tels quels. */
function valueLabel(facette: string, value: string) {
	if (/NATURE$/.test(facette)) return natureLabel(value);
	if (/LEGAL_STATUS$/.test(facette)) return statusLabel(value);
	return value;
}

/** Valeurs montrées avant « Voir plus ». */
const SHOWN = 8;

const Group = ({ facet, selected, onToggle }: { facet: Facet; selected: string[]; onToggle: (value: string) => void }) => {
	const [all, setAll] = useState(false);
	// Les valeurs sans résultat sont masquées, sauf celles que l'on a retenues (pour pouvoir les retirer).
	const values = Object.entries(facet.values ?? {})
		.filter(([value, count]) => count > 0 || selected.includes(value))
		.sort((a, b) => b[1] - a[1]);
	if (values.length === 0) return null;
	const shown = all ? values : values.slice(0, SHOWN);
	return (
		<div className="legifrance-facet">
			<span className="legifrance-facet-name">{facetLabel(facet.facetElem)}</span>
			<div className="legifrance-facet-values">
				{shown.map(([value, count]) => (
					<button key={value} className={selected.includes(value) ? "is-active" : ""} aria-pressed={selected.includes(value)} onClick={() => onToggle(value)}>
						{valueLabel(facet.facetElem, value)} <span className="legifrance-facet-count">{count.toLocaleString("fr-FR")}</span>
					</button>
				))}
				{values.length > SHOWN && <a onClick={() => setAll(!all)}>{all ? "Moins" : `+ ${values.length - SHOWN}`}</a>}
			</div>
		</div>
	);
};

/**
 * Affiner les résultats : par nature (lois, décrets…), état (en vigueur, abrogé), code, juridiction… selon ce que le fond
 * propose. Choisir une valeur relance la recherche avec ce filtre ; plusieurs valeurs d'une même facette s'additionnent.
 */
export const FacetFilters = ({ facets, selected, onToggle, onClear }: { facets: Facet[]; selected: Record<string, string[]>; onToggle: (facette: string, value: string) => void; onClear: () => void }) => {
	const groups = facets.filter((facet) => !HIDDEN.has(facet.facetElem));
	const active = Object.values(selected).some((values) => values.length > 0);
	if (groups.length === 0 && !active) return null;
	return (
		<div className="legifrance-facets">
			{groups.map((facet) => (
				<Group key={facet.facetElem} facet={facet} selected={selected[facet.facetElem] ?? []} onToggle={(value) => onToggle(facet.facetElem, value)} />
			))}
			{active && <a className="legifrance-facets-clear" onClick={onClear}>Effacer les filtres</a>}
		</div>
	);
};
