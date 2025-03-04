type ResearchType = 'simple' | 'avancee';

interface ResearchTypeButtonsProps {
    type: ResearchType;
    handleClick: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
    activeType: string;
}

export const ResearchTypeButtons = ({ type, handleClick, activeType }: ResearchTypeButtonsProps) => {

    const researchTypes = {
        simple: "Recherche simple",
        avancee: "Recherche avancée",
    };
    return (
        <button disabled={activeType === type} value={type} onClick={handleClick} className='button'>
            {researchTypes[type]}
        </button>)
};
