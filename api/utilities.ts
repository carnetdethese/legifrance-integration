import { DilaApiClient } from '@socialgouv/dila-api-client'

const dilaApi = new DilaApiClient();

function rechercheSimple(valeur:string, fond:string, nbResultat:number) {
  return {
    "recherche": {
        "pageSize":nbResultat,
        "sort": "PERTINENCE",
        "pageNumber": 1,
        "champs": [
            {
                "typeChamp": "ALL",
                "criteres": [
                    {
                        "typeRecherche": "EXACTE",
                        "valeur": valeur,
                        "operateur": "ET"
                    }
                ],
                "operateur": "ET"
            }
        ],
        "typePagination": "DEFAUT"
    },
  "fond": fond
  }
}

export async function searchText(search:string, fond:string, maxResults:number) {
  const requestOptions = {
    path: "/search",
    method: "POST",
    params: rechercheSimple(search, fond, maxResults)
  }
  return await dilaApi.fetch(requestOptions)
}

export async function fetchText(id:string, valeurRecherche:string) {
  const requestOptions = {
    path: "/consult/juri",
    method: "POST",
    params: {
      "textId": id,
      "searchedString": valeurRecherche
    }};
    
  return await dilaApi.fetch(requestOptions)
}