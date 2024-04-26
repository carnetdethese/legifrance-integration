import { Decision } from "abstracts/decisions";
import { App } from "obsidian";
import Mustache from 'mustache';
import { dataFiche, ficheArretChamp } from "api/utilities";

Mustache.escape = function(value)
{
    return value;
};


export class newNote {
    app:App;
    template:string;
    titreTemplate:string;
    data:Decision;
    folder:string;
    champFiche:ficheArretChamp;
    dataNote:dataFiche;


    constructor(app:App, template:string, templateTitre:string, data:Decision) {
        this.app = app;
        this.template = template;
        this.champFiche = {
            fait: "",
            procedure: "",
            moyens: "",
            question: "",
            solution: ""       
         }
        this.data = data;
        this.folder = this.folderSetting("Décisions/");
        this.titreTemplate = templateTitre;
    }

    folderSetting(chosenFolder:string) {
        const filePath = chosenFolder + this.data.juridiction + "/";
        return filePath
    }

    async renderFileTitle () {
        return await Mustache.render(this.titreTemplate, this.data)
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
        const noteContent = await Mustache.render(this.template, this.dataNote);

        if (this.app.vault.getFolderByPath("Décisions/" + this.data.juridiction) === null) {
            console.log("Dossier inexistant alors dossier créé.");
            this.app.vault.createFolder("Décisions/" + this.data.juridiction);
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