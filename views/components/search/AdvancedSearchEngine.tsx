import * as constants from '../../../api/constants';
import React from 'react';
import { DatePicker } from './DatePicker';


export const OperateurGeneral = () => {
	return	(<div className="setting-item">
		<div className="setting-item-info">
			<label className="setting-item-name">Opérateur général</label>
		</div>
		<div className="setting-item-control">
			<select className="dropdown">
				{Array.from(constants.operateursRecherche.entries()).map(
					([k, v]) => (
						<option key={k} value={k}>
							{v}
						</option>
					)
				)}
			</select>
		</div>
	</div>);
};


export const AdvancedSearchEngine = ({ handleDateChange }) => {
	return <>
		<DatePicker handleDateChange={handleDateChange} />
	</>
}