import React from "react";

export const SearchTerm = ({ rank, handleSearchTermChange, handleKeyDown }) => {
	return <div className="setting-item">
		<div className="setting-item-info">
			<label className="setting-item-name">Recherche</label>
		</div>
		<div className="setting-item-control">
			<input type="text" name={rank} onChange={(e) => handleSearchTermChange(e)} onKeyDown={(e) => handleKeyDown(e)} />
		</div>
	</div>;
};
