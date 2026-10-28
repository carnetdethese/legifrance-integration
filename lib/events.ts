/**
 * Événements internes du plugin (`plugin.events`). Une vue React s'y abonne par les hooks de `views/hooks.tsx` ;
 * celui qui change une donnée déclenche l'événement correspondant, jamais l'inverse (une vue qui déclencherait
 * l'événement qu'elle écoute bouclerait).
 */

/** L'historique des documents consultés a changé. */
export const HISTORY_EVENT = "history-change";

/** La base des références (liens, fiches, décisions, articles) ou l'état d'une recherche de lien a changé. */
export const REFERENCES_EVENT = "references-change";

/** Une tâche longue a démarré, avancé ou fini. */
export const TASK_EVENT = "task-change";
