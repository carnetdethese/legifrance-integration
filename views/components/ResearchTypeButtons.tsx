import React from 'react';

type ResearchType = 'simple' | 'avancee';

interface ResearchTypeButtonsProps {
    activeType: ResearchType;
    handleClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

export const ResearchTypeButtons = ({ activeType, handleClick }: ResearchTypeButtonsProps) => {

    const researchTypes = {
        simple: "Recherche simple",
        avancee: "Recherche avancée",
    };
    return (
        <button value={activeType} onClick={handleClick}>
            {researchTypes[activeType]}
        </button>
    );
};
