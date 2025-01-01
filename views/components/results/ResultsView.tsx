import React from "react";
import { ResultsNav } from "./ResultsNav";
import { ResultCard } from "./ResultCard";
import { legalDocument } from "abstracts/document";

interface ResultsViewProps {
    results: legalDocument[];
    totalResults: number;
    totalPageNb: number;
}

export const ResultsView = ({ results, totalResults, totalPageNb }: ResultsViewProps) => {

    console.log(results);
    return <>
        <h2>Résulats</h2>
        <ResultsNav totalResults={totalResults} totalPageNumber={totalPageNb} />
        {results.map((value, index) => {
            return <ResultCard result={value} index={index} />
        })}
    </>
}