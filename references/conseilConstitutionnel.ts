/**
 * Site du Conseil constitutionnel : certaines décisions (les QPC récentes, notamment) ne sont pas dans
 * le fond « Conseil constitutionnel » de Légifrance, seulement au Journal officiel et sur le site du
 * Conseil. Les pages du site ont une adresse prévisible : `decision/<année>/<numéro sans tiret><type>.htm`.
 */
import { requestUrl } from "obsidian";
import { ccSiteUrl } from "./ids";

/** Page du site pour ce numéro, si elle existe. Jamais bloquant : une erreur réseau donne `null`. */
export async function findCcSiteDecision(number: string): Promise<{ url: string; titre: string } | null> {
	const url = ccSiteUrl(number);
	if (!url) return null;
	try {
		const response = await requestUrl({ url, throw: false });
		return response.status === 200 ? { url, titre: `Conseil constitutionnel, décision n° ${number.trim()}` } : null;
	} catch {
		return null;
	}
}
