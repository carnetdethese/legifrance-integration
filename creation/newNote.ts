import { Decisions } from "abstracts/decisions";
import { App } from "obsidian";

const Mustache = require('mustache')

export class newNote {
    app:App;
    template:string;
    data:Decisions;
    folder:string;

    constructor(app:App, template:string, data:Decisions) {
        this.app = app;
        this.template = template;
        this.data = data;
        this.folder = this.folderSetting("Décisions/");
    }

    folderSetting(chosenFolder:string) {
        return chosenFolder
    }

    createNote(filename:string) {
        let filePath:string = this.folder + filename;

        Mustache.escape = function(text:string) {
            return text;
        }

        const noteContent = Mustache.render(this.template, this.data);

        if (this.app.vault.getFolderByPath("Décisions") == null) {
            console.log("Dossier inexistant.");
            this.app.vault.createFolder("Décisions");
        }
        
        if (this.app.vault.getFileByPath(filePath) == null) {
            filePath += ".md";
            this.app.vault.create(filePath, noteContent);
        }
        else {
            filePath += Date.now() + ".md";
            this.app.vault.create(filePath, "hello !");
        }
    }
    
}