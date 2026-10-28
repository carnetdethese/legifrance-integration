import { DateFormat } from "./dateHandler";

/** Vrai si `start` est antérieure ou égale à `end` (dates au format AAAA-MM-JJ). */
export function startDateBeforeEndDate(
	start: DateFormat | string,
	end: DateFormat | string
) {
	return new Date(start.toString()) <= new Date(end.toString());
}

/** Date du jour au format AAAA-MM-JJ (fuseau local). */
export function getTodaysDate() {
	const now = new Date();
	return [
		now.getFullYear(),
		String(now.getMonth() + 1).padStart(2, "0"),
		String(now.getDate()).padStart(2, "0"),
	].join("-");
}
