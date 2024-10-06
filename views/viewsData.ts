import { Decision } from "abstracts/decisions";
import { legalDocument } from "abstracts/document";
import { legalStatute } from "abstracts/loi";
import { getDocumentsListe, popDocumentsList, pushDocumentsList, removeDocumentsList } from "globals/globals";

export class documentDataStorage {
    id: number;
    status:boolean;
    data: legalDocument | Decision | legalStatute;
    template?:string;

    constructor(id: number, data: legalDocument | Decision | legalStatute) {
        this.id = id;
        this.status = true;
        if (data.type == "jurisprudence") this.data = data as Decision;
        else this.data = data as legalStatute;
    }
}

// Function to add a new view and keep a reference to it.
export async function addView(data: any): Promise<documentDataStorage> {
    const id = getDocumentsListe().length > 0 ? getDocumentsListe()[getDocumentsListe().length - 1].id + 1 : 1;

    const newView = new documentDataStorage(id, data);
    pushDocumentsList(newView);
    // console.log(getDocumentsListe());
    return newView;
}

// Function to find a view by its ID
export function findViewById(id: number): documentDataStorage | undefined {
    return getDocumentsListe().find(view => view.id === id);
}

export function deleteDocEntry(id:number) {
    const result = getDocumentsListe().find(l => l.id == id);
    if (getDocumentsListe().length == 1) popDocumentsList();
    removeDocumentsList(result as documentDataStorage);
    return result;
}