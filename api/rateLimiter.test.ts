/** Tests du limiteur de débit. Lancer : `npm test`. */
import { RateLimiter } from "./rateLimiter";

// Le limiteur utilise `window.setTimeout` (fenêtres détachées d'Obsidian) : sous Node, `window` est l'objet global.
(globalThis as { window?: unknown }).window ??= globalThis;

let fail = 0;
const check = (name: string, ok: boolean, detail = "") => { if (!ok) { fail++; console.log("ÉCHEC", name, detail); } };

async function main() {
	// 2 requêtes par fenêtre de 200 ms : la 3e attend la fin de la fenêtre de la 1re.
	const limiter = new RateLimiter(2, 200);
	const start = Date.now();
	const times: number[] = [];
	await Promise.all([1, 2, 3, 4, 5].map(async () => { await limiter.acquire(); times.push(Date.now() - start); }));
	check("deux premières immédiates", times[0] < 50 && times[1] < 50, JSON.stringify(times));
	check("3e après la fenêtre", times[2] >= 190, JSON.stringify(times));
	check("5e dans la 3e fenêtre", times[4] >= 390, JSON.stringify(times));
	check("jamais plus de 2 par fenêtre", times.every((t, i) => times.filter((u, j) => j !== i && Math.abs(u - t) < 190 && u <= t).length < 2 || i < 2), JSON.stringify(times));
	check("compte total", limiter.total === 5);
	check("plus personne n'attend", limiter.waiting === 0 && limiter.nextSlot === 0);

	// Illimité.
	const free = new RateLimiter(0, 200);
	const t0 = Date.now();
	await Promise.all(Array.from({ length: 20 }, () => free.acquire()));
	check("illimité", Date.now() - t0 < 100);

	// Pause après un quota dépassé.
	const paused = new RateLimiter(10, 200);
	paused.backoff(150);
	check("suspension annoncée", paused.suspendedUntil > Date.now());
	const t1 = Date.now();
	await paused.acquire();
	check("attend la fin de la suspension", Date.now() - t1 >= 140, String(Date.now() - t1));
	check("suspension terminée", paused.suspendedUntil === 0);

	// Limite abaissée en cours de route.
	const dynamic = new RateLimiter(5, 200);
	await Promise.all([1, 2, 3].map(() => dynamic.acquire()));
	dynamic.setLimit(3);
	const t2 = Date.now();
	await dynamic.acquire();
	check("nouvelle limite appliquée", Date.now() - t2 >= 190, String(Date.now() - t2));
	check("usage de la fenêtre", dynamic.used >= 1 && dynamic.used <= 3);

	// Une requête interactive passe devant celles de fond qui attendent déjà.
	const lanes = new RateLimiter(1, 120);
	const order: string[] = [];
	await lanes.acquire();
	const waiting = [lanes.acquire("background").then(() => order.push("fond 1")), lanes.acquire("background").then(() => order.push("fond 2"))];
	await new Promise((resolve) => setTimeout(resolve, 20));
	waiting.push(lanes.acquire("interactive").then(() => order.push("interactive")));
	await Promise.all(waiting);
	check("priorité à l'interactif", order[0] === "interactive" || order[1] === "interactive", JSON.stringify(order));
	check("l'interactif devant le 2e fond", order.indexOf("interactive") < order.indexOf("fond 2"), JSON.stringify(order));

	console.log(fail ? `${fail} échec(s)` : "tout passe");
	process.exit(fail ? 1 : 0);
}
void main();
