import { Plus, X } from "lucide-react";
import { operateursRecherche, typeRecherche } from "api/constants";
import { fondDef } from "abstracts/fonds";
import { DocumentSearch, MAX_CRITERES } from "abstracts/searchHandler";
import { DatePicker } from "./DatePicker";

interface SearchOptionsProps {
	recherche: DocumentSearch;
	/** Reçoit la nouvelle recherche après chaque modification. */
	onChange: (recherche: DocumentSearch) => void;
	onSubmit: () => void;
}

/** Ce que la recherche simple ne montre pas : critères supplémentaires (et / ou, façon de chercher) et période ou date de version. */
export const SearchOptions = ({ recherche, onChange, onSubmit }: SearchOptionsProps) => {
	const criteres = recherche.recherche.champs[0].criteres;
	const dateMode = fondDef(recherche.fond).dateMode;

	return (
		<div className="legifrance-options">
			{criteres.slice(1).map((critere, index) => {
				const rank = index + 1;
				return (
					<div key={rank} className="legifrance-extra">
						<div className="legifrance-extra-head">
							<select
								className="dropdown"
								aria-label="Lien avec le critère précédent"
								value={critere.operateur}
								onChange={(e) => onChange(recherche.updateOperateurCritereChamp(0, rank, e.target.value, true) as DocumentSearch)}
							>
								{Array.from(operateursRecherche, ([code, label]) => (
									<option key={code} value={code}>{label}</option>
								))}
							</select>
							<select
								className="dropdown"
								aria-label="Façon de chercher"
								value={critere.typeRecherche}
								onChange={(e) => onChange(recherche.updateTypeRechercheChamp(0, rank, e.target.value, true) as DocumentSearch)}
							>
								{Array.from(typeRecherche, ([code, label]) => (
									<option key={code} value={code}>{label}</option>
								))}
							</select>
							<button type="button" className="clickable-icon" aria-label="Retirer ce critère" onClick={() => onChange(recherche.deleteCritere(0, rank, true)!)}>
								<X size={16} />
							</button>
						</div>
						<input
							type="text"
							aria-label={`Critère ${rank + 1}`}
							placeholder={`Critère ${rank + 1}`}
							value={critere.valeur}
							onChange={(e) => onChange(recherche.updateValue(0, rank, e.target.value, true) as DocumentSearch)}
							onKeyDown={(e) => e.key === "Enter" && onSubmit()}
						/>
					</div>
				);
			})}
			<button type="button" className="legifrance-add-criterion" disabled={criteres.length >= MAX_CRITERES} onClick={() => onChange(recherche.createCritere(0, true)!)}>
				<Plus size={14} /> Ajouter un critère
			</button>
			{dateMode !== "none" && (
				// `key` réinitialise les champs date lorsque le fond (et donc la période) change.
				<DatePicker key={recherche.fond} single={dateMode === "single"} onChange={(place, value) => onChange(recherche.setDate(value, place, true)!)} />
			)}
		</div>
	);
};
