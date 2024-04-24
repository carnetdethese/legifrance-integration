import { Decision } from "abstracts/decisions";
import { App } from "obsidian";
import Mustache from 'mustache';
import { ficheArretChamp } from "api/utilities";

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

    constructor(app:App, template:string, templateTitre:string, data:Decision) {
        this.app = app;
        this.template = template;
        this.data = data;
        this.folder = this.folderSetting("Décisions/");
        this.titreTemplate = templateTitre;
        this.champFiche = {
            fait: "",
            procedure: "",
            moyens: "",
            question: "",
            solution: ""       
         }
    }

    folderSetting(chosenFolder:string) {
        const filePath = chosenFolder + this.data.juridiction + "/";
        return filePath
    }

    async renderFileTitle () {
        return await Mustache.render(this.titreTemplate, this.data)
    }
 
    async createNote() {
        let filePath:string = this.folder + await this.renderFileTitle();
        const noteContent = await Mustache.render(this.template, this.data);

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