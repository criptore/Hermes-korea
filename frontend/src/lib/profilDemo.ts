import { api, type ProfilDemo } from "./api";
import { markOnboardingDone, saveUserProfile, type UserProfile } from "./userProfile";

// Profil utilisateur de la démo (fictif) : complète le profil de base écrit
// côté backend (profil métier, veille, workflow HERMION, pipeline).
export const PROFIL_UTILISATEUR_DEMO: UserProfile = {
  firstName: "Demo",
  lastName: "User",
  email: "",
  entreprise: "Hanbit Digital Co. (demo)",
  activite:
    "Korean IT and digital consulting SME — public information systems, cloud, " +
    "cybersecurity, AI/data platforms",
  infosUtiles:
    "85 staff, ISO 27001 and ISO 9001 certified. References: ministry information system " +
    "maintenance (3 years), cloud migration for a metropolitan city, e-government platform " +
    "in Viet Nam (World Bank-financed).",
};

// HERMES Korea : l'app n'est pas vierge — au premier lancement (ou à chaque
// nouvelle version du préchargement), le profil utilisateur local est remplacé
// par celui de la démo. Le backend fait de même côté MNEMOSYNE
// (`hermes.precharge_demo`, même identifiant de version).
const CLE_PRECHARGE = "hermes.demoPreload";
export const VERSION_PRECHARGE = "korea-1";

/** Précharge le profil de démo en localStorage, une seule fois par version. */
export function prechargerProfilLocal(): void {
  try {
    if (window.localStorage.getItem(CLE_PRECHARGE) === VERSION_PRECHARGE) return;
    saveUserProfile(PROFIL_UTILISATEUR_DEMO);
    markOnboardingDone();
    window.localStorage.setItem(CLE_PRECHARGE, VERSION_PRECHARGE);
  } catch {
    // Stockage indisponible : l'onboarding classique prendra le relais.
  }
}

/**
 * Charge le profil de base de démo (backend + profil utilisateur local) et marque
 * l'onboarding terminé. `cleGemini` (facultative) active Gemini en priorité.
 */
export async function chargerProfilDemo(
  options: { activerGemini?: boolean; cleGemini?: string } = {},
): Promise<{ profil: UserProfile; resume: ProfilDemo }> {
  const cle = options.cleGemini?.trim();
  const resume = await api.chargerProfilDemo({
    activer_gemini: options.activerGemini ?? Boolean(cle),
    gemini_cle: cle || undefined,
  });
  const profil = saveUserProfile(PROFIL_UTILISATEUR_DEMO);
  markOnboardingDone();
  return { profil, resume };
}
