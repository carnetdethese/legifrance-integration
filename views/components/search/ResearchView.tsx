import { useState } from "react";
import { ResearchTypeButtons } from "./ResearchTypeButtons";
import { HistoriqueView } from "./HistoriqueView";
import { ChampFond } from "./ChampFond";
import { SimpleSearchEngine } from "../search/SimpleSearchEngine";
import { AdvancedSearchEngine } from "./AdvancedSearchEngine";
import { documentSearchFieldsClass } from "abstracts/searchHandler";
import LegifrancePlugin from "main";
import { usePlugin } from "../../hooks";
import { Notice } from "obsidian";

const SubmitButton = ({ handleLaunchSearchClick }) => {
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

	function handleResearchTypeClick(e) {
		setActiveResearchType(e.target.value);
	}

	function handleFondSelect(e) {
		const newFond = e.target.value;
		const newSearch = recherche.updatingFond(
			newFond,
			true
		) as documentSearchFieldsClass;
		setRecherche(newSearch);
	}

	function handleDateChange(e) {
		if (e.target.name == "start-date") {
			const newSearch = recherche.setDate(
				e.target.value,
				"start",
				true
			) as documentSearchFieldsClass;
			setRecherche(newSearch);
		} else if (e.target.name == "end-date") {
			const newSearch = recherche.setDate(
				e.target.value,
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

	function handleSearchTermChange(e) {
		const rank = e.target.dataset.rank;
		const newSearch = recherche.updateValue(
			0,
			rank,
			e.target.value,
			true
		) as documentSearchFieldsClass;
		setRecherche(newSearch);
	}

	function handleKeyDown(e) {
		if (e.key == "Enter") handleLaunchSearchClick();
	}

	function handleTypeRechercheChange(e) {
		const rank = e.target.dataset.rank;
		const value = e.target.value;
		const newSearch = recherche.updateTypeRechercheChamp(
			0,
			rank,
			value,
			true
		) as documentSearchFieldsClass;
		setRecherche(newSearch);
		return;
	}

	function handleOperateurRechercheChange(e) {
		const rank = e.target.dataset.rank;
		const value = e.target.value;
		const newSearch = recherche.updateOperateurCritereChamp(
			0,
			rank,
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
			console.log(critere);
			newSearch = recherche.deleteCritere(
				0,
				critere,
				true
			) as documentSearchFieldsClass;
		}
		setRecherche(newSearch);
	}

	console.log(recherche.recherche.champs[0].criteres);

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
