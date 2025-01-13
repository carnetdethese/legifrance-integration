import { useState } from "react";
import { ResearchTypeButtons } from "./ResearchTypeButtons";
import { HistoriqueView } from "./HistoriqueView";
import { ChampFond } from "./ChampFond";
import { SimpleSearchEngine } from "../search/SimpleSearchEngine";
import { AdvancedSearchEngine } from "./AdvancedSearchEngine";
import { documentSearchFieldsClass } from "abstracts/searchHandler";
import LegifrancePlugin from "main";
import { Notice } from "obsidian";

const SubmitButton = ({ handleLaunchSearchClick }: { handleLaunchSearchClick: () => void;}) => {
	return (
		<div className="setting-item">
			<div className="setting-item-control">
				<button className="mod-cta" onClick={handleLaunchSearchClick}>
					Valider
				</button>
			</div>
		</div>
	);
};

export const ResearchView = () => {
	const [recherche, setRecherche] = useState<documentSearchFieldsClass>(
		new documentSearchFieldsClass()
	);
	const [activeResearchType, setActiveResearchType] = useState("simple");

	function handleResearchTypeClick(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
		const target = e.target as HTMLButtonElement;
		setActiveResearchType(target.value);
	}

	function handleFondSelect(e: React.ChangeEvent<HTMLSelectElement>) {
		const target = e.target as HTMLSelectElement;
		const newFond = target.value;
		const newSearch = recherche.updatingFond(
			newFond,
			true
		) as documentSearchFieldsClass;
		setRecherche(newSearch);
	}

	function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
		const target = e.target as HTMLInputElement;
		if (target.name == "start-date") {
			const newSearch = recherche.setDate(
				target.value,
				"start",
				true
			) as documentSearchFieldsClass;
			setRecherche(newSearch);
		} else if (target.name == "end-date") {
			const newSearch = recherche.setDate(
				target.value,
				"end",
				true
			) as documentSearchFieldsClass;
			setRecherche(newSearch);
		}
	}

	async function handleLaunchSearchClick() {
		const pluginInstance = LegifrancePlugin.instance;
		if (recherche.fond == "") {
			new Notice("Ajoutez un fond !");
			return;
		}
		pluginInstance.activateResultsView(recherche);
	}

	function handleSearchTermChange(e: React.ChangeEvent<HTMLInputElement>) {
		const target = e.target as HTMLInputElement;
		const rank = target.dataset.rank;
		const newSearch = recherche.updateValue(
			0,
			parseInt(rank ? rank : ''),
			target.value,
			true
		) as documentSearchFieldsClass;
		setRecherche(newSearch);
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key == "Enter") handleLaunchSearchClick();
	}

	function handleTypeRechercheChange(e: React.ChangeEvent<HTMLSelectElement>) {
		const target = e.target as HTMLSelectElement;
		const rank = target.dataset.rank;
		const value = target.value;
		const newSearch = recherche.updateTypeRechercheChamp(
			0,
			parseInt(rank ? rank : ''),
			value,
			true
		) as documentSearchFieldsClass;
		setRecherche(newSearch);
		return;
	}

	function handleOperateurRechercheChange(e:React.ChangeEvent<HTMLSelectElement>) {
		const target = e.target as HTMLSelectElement;
		const rank = target.dataset.rank;
		const value = target.value;
		const newSearch = recherche.updateOperateurCritereChamp(
			0,
			parseInt(rank ? rank : ''),
			value,
			true
		) as documentSearchFieldsClass;
		setRecherche(newSearch);
		return;
	}

	function handleCritereAddOrRemove(ope: string, critere: number) {
		let newSearch = new documentSearchFieldsClass();
		if (ope == "add") {
			newSearch = recherche.createCritere(
				0,
				true
			) as documentSearchFieldsClass;
		} else if (ope == "remove") {
			newSearch = recherche.deleteCritere(
				0,
				critere,
				true
			) as documentSearchFieldsClass;
		}
		setRecherche(newSearch);
	}


	return (
		<>
			<div className="view-content">
				<div className="setting-item">
					<div className="setting-item-control">
						<ResearchTypeButtons
							type={"simple"}
							handleClick={handleResearchTypeClick}
							activeType={activeResearchType}
						/>
						<ResearchTypeButtons
							type={"avancee"}
							handleClick={handleResearchTypeClick}
							activeType={activeResearchType}
						/>
					</div>
				</div>

				<ChampFond
					handleFondSelect={handleFondSelect}
					fond={recherche.fond}
				/>
				{activeResearchType == "simple" ? (
					<SimpleSearchEngine
						recherche={recherche}
						handleDateChange={handleDateChange}
						handleSearchTermChange={handleSearchTermChange}
						handleKeyDown={handleKeyDown}
						handleOperateurRechercheChange={
							handleOperateurRechercheChange
						}
						handleTypeRechercheChange={handleTypeRechercheChange}
					/>
				) : (
					<AdvancedSearchEngine
						recherche={recherche}
						handleDateChange={handleDateChange}
						handleSearchTermChange={handleSearchTermChange}
						handleKeyDown={handleKeyDown}
						handleOperateurRechercheChange={
							handleOperateurRechercheChange
						}
						handleTypeRechercheChange={handleTypeRechercheChange}
						handleCritereAddOrRemove={handleCritereAddOrRemove}
					/>
				)}
				<SubmitButton
					handleLaunchSearchClick={handleLaunchSearchClick}
				/>
				<HistoriqueView />
			</div>
		</>
	);
};
