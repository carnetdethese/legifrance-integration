import React from "react";
import * as constants from "../../../api/constants";
import { documentSearchFieldsClass } from "abstracts/searchHandler";

interface OperateursBooleensProps {
	rank: number;
	recherche: documentSearchFieldsClass;
	handleTypeRechercheChange: (
		event: React.MouseEvent<HTMLSelectElement, MouseEvent>
	) => void;
	handleOperateurRechercheChange: (
		event: React.MouseEvent<HTMLSelectElement, MouseEvent>
	) => void;
}

export const OperateursBooleens = ({
	recherche,
	rank,
	handleTypeRechercheChange,
	handleOperateurRechercheChange,
}: OperateursBooleensProps) => {
	return (
		<div className="setting-item">
			<div className="setting-item-control">
				<select
					data-rank={rank}
					className="dropdown"
					onChange={(e) => handleTypeRechercheChange(e)}
					value={recherche.recherche.champs[0].criteres[rank].typeRecherche}
				>
					{Array.from(constants.typeRecherche.entries()).map(
						([v, k]) => {
							return (
								<option value={v} key={v}>
									{k}
								</option>
							);
						}
					)}
				</select>
				<select
					data-rank={rank}
					className="dropdown"
					onChange={(e) => handleOperateurRechercheChange(e)}
					value={recherche.recherche.champs[0].criteres[rank].operateur}
				>
					{Array.from(constants.operateursRecherche.entries()).map(
						([v, k]) => {
							return (
								<option value={v} key={v}>
									{k}
								</option>
							);
						}
					)}
				</select>
			</div>
		</div>
	);
};
