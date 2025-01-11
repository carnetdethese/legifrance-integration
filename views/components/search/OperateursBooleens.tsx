import React from "react";
import * as constants from '../../../api/constants';

interface OperateursBooleensProps {
    handleTypeRechercheChange: (event: React.MouseEvent<HTMLSelectElement, MouseEvent>) => void;
    handleOperateurRechercheChange: (event: React.MouseEvent<HTMLSelectElement, MouseEvent>) => void;
}

export const OperateursBooleens = ({ handleTypeRechercheChange, handleOperateurRechercheChange }: OperateursBooleensProps) => {

	return (
		<div className="setting-item">
			<div className="setting-item-control">
				<select className="dropdown" onChange={(e) => handleTypeRechercheChange(e)}>
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
				<select className="dropdown" onChange={(e) => handleOperateurRechercheChange(e)}>
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
