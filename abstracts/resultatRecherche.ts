export interface resultatsRecherche {
	results: {
        titles?: {
            id?:string,
            title?:string
        }
        nature?:string,
		text: string,
		origin:string,
        date?:string
	}
}