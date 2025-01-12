import { legalDocument } from "abstracts/document";
import parse from "html-react-parser";

interface InfoCardProps {
    data: legalDocument
}

export const InfoCard = ({ data }: InfoCardProps) => {
    let lienPdf;

    if (data.origin == "CIRC") {
        lienPdf = `https://www.legifrance.gouv.fr/download/pdf/circ?id=${data.id}`
    }

    const removeHtmlTags = /(<([^>]+)>)/gi;
    const titre = data.titre.replace(removeHtmlTags, "");

    return <>
        <div className="info-box">
            <h3>Informations</h3>
            <div>
                {data.titre ? <p>Titre : {titre}</p> : ''}
                {data.juridiction ? <p>Juridiction : {data.juridiction}</p> : ''}
                {data.auteur ? <p>Auteur : {data.auteur}</p> : ''}
                {data.formation ? <p>Formation : {data.formation}</p> : ''}
                {data.date ? <p>Date : {data.date}</p> : ''}
                {data.numero ? <p>Numéro : {data.numero}</p> : ''}
                {data.abstract ? <p>Solution : {data.abstract}</p> : ''}
                {data.lien ? <p><a href={data.lien}>Légifrance - {data.id}</a></p> : ''}
                {data.urlCC ? <p><a href={data.urlCC}>Conseil constitutionnel - {data.numero}</a></p> : ''}
                {lienPdf != null ? <p><a href={lienPdf}>Télécharger le document</a></p> : ''}
            </div>
        </div>
    </>
}