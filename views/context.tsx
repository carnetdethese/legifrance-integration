import { createContext } from "react";
import LegifrancePlugin from "main";

/** Donne aux composants React un accès à l'instance du plugin. */
export const PluginContext = createContext<LegifrancePlugin | undefined>(
	undefined
);
