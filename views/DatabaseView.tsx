import { DatabasePanel } from "./components/database/DatabasePanel";
import { ReactItemView } from "./ReactItemView";

export const DATABASE_VIEW = "database-view";

/** Onglet d'inspection de la base SQLite : tables, références analysées, liens et fiches de décisions. */
export class DatabaseView extends ReactItemView {
	getViewType() {
		return DATABASE_VIEW;
	}

	getDisplayText() {
		return "Base de données";
	}

	getIcon() {
		return "database";
	}

	protected contentClasses() {
		return ["is-database"];
	}

	protected renderContent() {
		return <DatabasePanel />;
	}
}
