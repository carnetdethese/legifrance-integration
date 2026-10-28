/**
 * Le fichier SQLite de la base (`legifrance.sqlite`, dans le dossier du plugin) : ouverture tolérante aux
 * fichiers abîmés, migration des données d'un ancien analyseur, écriture qui ne laisse jamais un fichier tronqué.
 * La base elle-même (schéma, requêtes) est dans `database.ts` ; elle vit en mémoire et n'est écrite qu'ici.
 */
import { App, Notice, normalizePath } from "obsidian";
import { LegalDatabase } from "./database";
import { MigrationReport, needsParserMigration, upgradeParserData } from "./migrate";

const DATABASE_FILE = "legifrance.sqlite";

export class DatabaseFile {
	readonly path: string;
	/** La base ouverte par `open`. */
	database!: LegalDatabase;
	/** Écritures de la base, l'une après l'autre : deux écritures simultanées abîmeraient le fichier. */
	private saving: Promise<void> = Promise.resolve();

	/**
	 * @param pluginDir dossier du plugin dans le coffre (`manifest.dir`).
	 * @param onChange appelé après chaque modification de la base : le plugin y planifie l'écriture (`save`).
	 */
	constructor(private readonly app: App, pluginDir: string, private readonly onChange: () => void) {
		this.path = normalizePath(`${pluginDir}/${DATABASE_FILE}`);
	}

	/**
	 * Ouvre la base, ou en crée une vide si le fichier n'existe pas. Un fichier illisible (écriture
	 * interrompue…) est mis de côté sous un autre nom, jamais écrasé ni supprimé : la base n'est qu'un cache
	 * reconstructible, le plugin doit toujours démarrer. Les données issues d'un ancien analyseur sont réécrites
	 * (doublons fusionnés, liens et textes conservés), après une copie de sauvegarde.
	 *
	 * @returns le bilan de la migration faite à cette ouverture, s'il y en a eu une.
	 */
	async open(): Promise<MigrationReport | undefined> {
		const { adapter } = this.app.vault;
		let database: LegalDatabase | undefined;
		for (const path of [this.path, `${this.path}.tmp`]) {
			if (!(await adapter.exists(path))) continue;
			try {
				database = await LegalDatabase.open(new Uint8Array(await adapter.readBinary(path)), this.onChange);
				break;
			} catch (error) {
				console.error(`[Légifrance] base illisible (${path})`, error);
				const aside = `${path}.illisible-${Date.now()}`;
				await adapter.rename(path, aside).catch(() => undefined);
				new Notice(`La base de données était illisible : elle est conservée sous « ${aside} » et une base vide est recréée.`, 10000);
			}
		}
		this.database = database ?? (await LegalDatabase.open(undefined, this.onChange));

		if (needsParserMigration(this.database)) {
			const backup = `${this.path}.avant-migration-v2`;
			if ((await adapter.exists(this.path)) && !(await adapter.exists(backup))) {
				await adapter.copy(this.path, backup).catch((error) => console.error("[Légifrance] sauvegarde avant migration", error));
			}
		}
		return upgradeParserData(this.database);
	}

	/** Écrit le fichier ; les écritures s'enchaînent, une erreur est journalisée sans bloquer les suivantes. */
	save() {
		this.saving = this.saving.then(() => this.write()).catch((error) => console.error("[Légifrance] enregistrement de la base", error));
		return this.saving;
	}

	/**
	 * Écrit dans un fichier temporaire complet, puis le substitue à la base : une interruption ne laisse
	 * jamais un fichier tronqué à la place de la base (au pire, le temporaire est repris à l'ouverture).
	 */
	private async write() {
		const { adapter } = this.app.vault;
		const bytes = this.database.export();
		const temporary = `${this.path}.tmp`;
		await adapter.writeBinary(temporary, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
		if (await adapter.exists(this.path)) await adapter.remove(this.path);
		await adapter.rename(temporary, this.path);
	}
}
