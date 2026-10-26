import { Minus, Plus } from "lucide-react";
import { operateursRecherche, typeRecherche } from "api/constants";
import { fondDef } from "abstracts/fonds";
import { MAX_CRITERES, documentSearchFieldsClass } from "abstracts/searchHandler";
import { SettingRow } from "../SettingRow";
import { DatePicker } from "./DatePicker";

interface SearchFormProps {
	recherche: documentSearchFieldsClass;
	/** Reçoit la nouvelle recherche après chaque modification. */
	onChange: (recherche: documentSearchFieldsClass) => void;
	onSubmit: () => void;
	/** Recherche avancée : plusieurs critères combinables. */
	advanced: boolean;
}

/** Champs de recherche : période, critères (un seul en mode simple) et leurs opérateurs. */
export const SearchForm = ({ recherche, onChange, onSubmit, advanced }: SearchFormProps) => {
	const criteres = recherche.recherche.champs[0].criteres;

	return (
		<>
			{fondDef(recherche.fond).dateMode !== "none" && (
				// `key` réinitialise les champs date lorsque le fond (et donc la période) change.
				<DatePicker
					key={recherche.fond}
					single={fondDef(recherche.fond).dateMode === "single"}
					onChange={(place, value) => onChange(recherche.setDate(value, place, true)!)}
				/>
			)}

			{criteres.map((critere, rank) => (
				<div key={rank} className="legifrance-critere">
					<SettingRow
						name={rank === 0 ? "Recherche" : `Critère ${rank + 1}`}
						htmlFor={`legifrance-critere-${rank}`}
					>
						<input
							id={`legifrance-critere-${rank}`}
							type="text"
							value={critere.valeur}
							onChange={(e) =>
								onChange(recherche.updateValue(0, rank, e.target.value, true) as documentSearchFieldsClass)
							}
							onKeyDown={(e) => e.key === "Enter" && onSubmit()}
						/>
					</SettingRow>
					<SettingRow name="">
						<select
							className="dropdown"
							aria-label="Type de recherche"
							value={critere.typeRecherche}
							onChange={(e) =>
								onChange(recherche.updateTypeRechercheChamp(0, rank, e.target.value, true) as documentSearchFieldsClass)
							}
						>
							{Array.from(typeRecherche, ([code, label]) => (
								<option key={code} value={code}>
									{label}
								</option>
							))}
						</select>
						<select
							className="dropdown"
							aria-label="Opérateur"
							value={critere.operateur}
							onChange={(e) =>
								onChange(recherche.updateOperateurCritereChamp(0, rank, e.target.value, true) as documentSearchFieldsClass)
							}
						>
							{Array.from(operateursRecherche, ([code, label]) => (
								<option key={code} value={code}>
									{label}
								</option>
							))}
						</select>
					</SettingRow>
				</div>
			))}

			{advanced && (
				<SettingRow name="Critères">
					<button
						aria-label="Ajouter un critère"
						disabled={criteres.length >= MAX_CRITERES}
						onClick={() => onChange(recherche.createCritere(0, true)!)}
					>
						<Plus size={16} />
					</button>
					<button
						aria-label="Retirer le dernier critère"
						disabled={criteres.length <= 1}
						onClick={() => onChange(recherche.deleteCritere(0, criteres.length - 1, true)!)}
					>
						<Minus size={16} />
					</button>
				</SettingRow>
			)}
		</>
	);
};
