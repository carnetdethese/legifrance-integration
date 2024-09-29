import * as Handlebars from "handlebars";
import { Decision } from "abstracts/decisions";
import { App } from "obsidian";
import { dataFiche  } from "api/utilities";
import { legalDocument } from "abstracts/document";
import { legalStatute } from "abstracts/loi";
import { ficheArretChamp, noteDocumentChamp } from "abstracts/searches";

// function isDecision(doc: legalDocument): doc is Decision {
//     return (doc as Decision).juridiction !== undefined;
// }

export function isDecision(doc: any): doc is Decision {
    return 'annee' in doc && 'juridiction' in doc && 'formation' in doc && 'urlCC' in doc && 'sommaires' in doc && 'abstract' in doc
}

export class newNote {
    app:App;
    template:string;
    titreTemplate:string;
    data:Decision | legalDocument | legalStatute;
    folder:string;
    champFiche:ficheArretChamp | noteDocumentChamp;
    dataNote:Partial<ficheArretChamp> | Partial<noteDocumentChamp>;


    constructor(app:App, template:string, templateTitre:string, data:Decision | legalDocument | legalStatute, dossierBase:string) {
        this.app = app;
        this.template = template;
        this.data = data.type == "jurisprudence" ? data as Decision : data as legalStatute;
        this.folder = this.folderSetting(dossierBase) || "";
        this.titreTemplate = templateTitre;
        
        if (data.type == "jurisprudence") {
            this.champFiche = {
                faits: "",
                procedure: "",
                moyens: "",
                question: "",
                solution: ""       
             }
        }
        else {
            this.champFiche = {
                notes: "",
                interet: "",
                connexes: "",
             };
        }
    }

    folderSetting(dossierBase:string) {
        let filePath = "";

        if (this.data.type == "jurisprudence") {
            console.log(this.data.type);
            filePath = `${dossierBase}/${this.data.juridiction}/`;
        }
        else {
            filePath = `${dossierBase}`;
        }

        return filePath
    }

    async renderFileTitle () {
        const titreTemplateCompiled = Handlebars.compile(this.titreTemplate, {noEscape: true});
        return titreTemplateCompiled(this.dataNote);
    }
 
    async createNote() {
        this.dataNote = {
            ...this.data,
            ...this.champFiche
        }

        let fileTitle;

        if (this.dataNote.titreNote) {
            fileTitle = this.dataNote.titreNote;
        }
        else {
            fileTitle = await this.renderFileTitle()
        }

        let filePath:string = this.folder + fileTitle;

        console.log(filePath);

        const templateContenuCompile = Handlebars.compile(this.template, {noEscape: true});
        const noteContent = templateContenuCompile(this.dataNote);

        if (this.data.type == "jurisprudence") {
            if (this.app.vault.getFolderByPath(this.folder + this.data.juridiction) === null) {
                console.log("Dossier inexistant alors dossier créé.");
                this.app.vault.createFolder(this.folder + this.data.juridiction);
            }
        }

        if (this.app.vault.getFileByPath(filePath + ".md") !== null) {
            filePath + Date.now();
        }

        filePath += ".md";
        await this.app.vault.create(filePath, noteContent);
        const abstractFile = this.app.vault.getFileByPath(filePath);
        if (abstractFile !== null) {
            await this.app.workspace.getLeaf().openFile(abstractFile);
        }
    }
    
}