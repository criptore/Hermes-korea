import { api, type ProfilDemo } from "./api";
import { markOnboardingDone, saveUserProfile, type UserProfile } from "./userProfile";

// Profil utilisateur de la démo (fictif) : complète le profil de base écrit
// côté backend (profil métier, veille, workflow HERMION, pipeline).
export const PROFIL_UTILISATEUR_DEMO: UserProfile = {
  firstName: "Demo",
  lastName: "User",
  email: "",
  entreprise: "Hanbit Digital Co. (demo)",
  activite: "Korean IT services SME — public information systems, cloud, cybersecurity, AI",
  infosUtiles:
    "85 staff, ISO 27001 and ISO 9001 certified. References: ministry information system " +
    "maintenance (3 years), cloud migration for a metropolitan city, e-government platform " +
    "in Viet Nam (World Bank-financed).",
};

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
