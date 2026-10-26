/**
 * Mise à jour intégrée de l'app desktop (plugin updater de Tauri).
 *
 * L'app lit `latest.json` dans la dernière GitHub Release, télécharge l'archive
 * de la nouvelle version, vérifie sa signature minisign (clé publique dans
 * tauri.conf.json), remplace l'app puis redémarre. Seul appel externe : il n'a
 * lieu que sur clic de l'utilisateur ou s'il a activé la vérification au
 * démarrage. Aucune donnée HERMES n'est envoyée. Hors Tauri : inerte.
 */

import { estTauri } from "./desktop";

export type MiseAJourDisponible = {
  version: string;
  date: string | null;
  notes: string;
};

export type ProgressionMiseAJour = { recus: number; total: number | null };

/** Mises à jour publiées pour macOS uniquement (Windows : installeur Inno Setup). */
export function miseAJourSupportee(): boolean {
  return estTauri() && /Mac/i.test(navigator.userAgent);
}

export async function versionActuelle(): Promise<string | null> {
  if (!estTauri()) return null;
  const { getVersion } = await import("@tauri-apps/api/app");
  return getVersion();
}

// Objet `Update` du plugin, gardé entre la vérification et l'installation.
type Update = Awaited<ReturnType<typeof import("@tauri-apps/plugin-updater").check>>;
let derniere: Update = null;

/** Interroge la dernière release ; `null` si HERMES est à jour. */
export async function verifierMiseAJour(): Promise<MiseAJourDisponible | null> {
  if (!miseAJourSupportee()) return null;
  const { check } = await import("@tauri-apps/plugin-updater");
  derniere = await check({ timeout: 30_000 });
  if (!derniere) return null;
  return {
    version: derniere.version,
    date: derniere.date ?? null,
    notes: derniere.body ?? "",
  };
}

/**
 * Télécharge et installe la version trouvée par `verifierMiseAJour`, puis
 * redémarre HERMES (le backend et PYTHIA sont arrêtés proprement à la sortie).
 */
export async function installerMiseAJour(
  surProgression: (p: ProgressionMiseAJour) => void,
): Promise<void> {
  if (!derniere) throw new Error("Check for updates first.");
  let recus = 0;
  let total: number | null = null;
  await derniere.downloadAndInstall((evt) => {
    if (evt.event === "Started") total = evt.data.contentLength ?? null;
    if (evt.event === "Progress") recus += evt.data.chunkLength;
    surProgression({ recus, total });
  });
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
