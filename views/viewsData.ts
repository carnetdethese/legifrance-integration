import { Decision } from "abstracts/decisions";
import { legalDocument } from "abstracts/document";
import { legalStatute } from "abstracts/loi";

export class documentDataStorage {
    id: number;
    data: legalDocument | Decision | legalStatute;

    constructor(id: number, data: legalDocument | Decision | legalStatute) {
        this.id = id;
        this.data = data;
    }
}

// Function to add a new view and keep a reference to it.
export function addView(data: any, views:documentDataStorage[]): documentDataStorage {
    const id = views.length > 0 ? views[views.length - 1].id + 1 : 1;
    const newView = new documentDataStorage(id, data);
    views.push(newView);
    return newView;
}

// Function to find a view by its ID
export function findViewById(id: number, views:documentDataStorage[]): documentDataStorage | undefined {
    return views.find(view => view.id === id);
}