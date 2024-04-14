import { DilaApiClient } from '@socialgouv/dila-api-client'

const dilaApi = new DilaApiClient();



function rechercheSimple(valeur:string, fond:string) {
  return {
    "recherche": {
        "pageSize":20,
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

export async function searchText(search:string, fond:string) {
  const requestOptions = {
    path: "/search",
    method: "POST",
    params: rechercheSimple(search, fond)
  }

  const results = await dilaApi.fetch(requestOptions);

  return results
}


