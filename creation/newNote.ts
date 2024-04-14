import { Decision } from "abstracts/decisions";
import { App } from "obsidian";

const Mustache = require('mustache');

Mustache.escape = function(text:string) {
    return text;
}

export class newNote {
    app:App;
    template:string;
    titreTemplate:string;
    data:Decision;
    folder:string;

    constructor(app:App, template:string, templateTitre:string, data:Decision) {
        this.app = app;
        this.template = template;
        this.data = data;
        this.folder = this.folderSetting("Décisions/");
        this.titreTemplate = templateTitre;
    }

    folderSetting(chosenFolder:string) {
        const filePath = chosenFolder + this.data.juridiction + "/";
        return filePath
    }

    renderFileTitle() {
        return Mustache.render(this.titreTemplate, this.data);
    }

    async createNote() {
        let filePath:string = this.folder + this.renderFileTitle();
        console.log(filePath);
        const noteContent = Mustache.render(this.template, this.data);

        if (this.app.vault.getFolderByPath("Décisions/" + this.data.juridiction) == null) {
            console.log("Dossier inexistant.");
            this.app.vault.createFolder("Décisions/" + this.data.juridiction);
        }

        if (this.app.vault.getFileByPath(filePath + ".md") != null) {
            filePath + Date.now();
        }

        filePath += ".md";
        await this.app.vault.create(filePath, noteContent);
        const abstractFile = this.app.vault.getFileByPath(filePath);
        await this.app.workspace.getLeaf().openFile(abstractFile);
    }
    
}