// Types et constantes partagés du frontend HERMES (agents, statuts, échéances).
// Les données viennent de MNEMOSYNE via `lib/api.ts` : plus aucun jeu fictif ici.

export type AgentKey = "argos" | "krinos" | "hermion";

export type AgentState = "active" | "running" | "inactive";

export type TagTone = "gold" | "green" | "violet" | "coral";

export type TenderTag = { label: string; tone: TagTone };

export type Tender = {
  id: string;
  title: string;
  issuer: string;
  portal: string;
  /** Date limite ISO ; null si l'AO n'en publie pas (jamais d'échéance inventée). */
  deadline: string | null;
  budget: string;
  reference: string;
  score: number;
  // false ou absent = AO jamais analysé par KRINOS (score à ignorer/afficher
  // « non analysé » plutôt que 0).
  analyzed?: boolean;
  tags: TenderTag[];
  summary: string;
  keypoints: string[];
  status: string;
  /** Valeur brute de StatutAO (brut, analyse, a_repondre…), pour les règles métier. */
  statutApi?: string;
  // État documents (Boucle 3/4) : liens détectés par ARGOS vs téléchargés.
  documentsDetectes?: number;
  documentsTelecharges?: number;
  horsProfilLaya?: boolean;
};

export type ResponseStatus =
  | "en-attente"
  | "a-modifier"
  | "validee"
  | "rejetee"
  | "exportee";

export const AGENTS: Record<
  AgentKey,
  { name: string; color: string; role: string }
> = {
  argos:   { name: "ARGOS",   color: "#1D9E75", role: "Collection" },
  krinos:  { name: "KRINOS",  color: "#7F77DD", role: "Analysis" },
  hermion: { name: "HERMION", color: "#D85A30", role: "Drafting" },
};

export const RESPONSE_STATUS: Record<
  ResponseStatus,
  { label: string; color: string; bg: string }
> = {
  "en-attente": { label: "Awaiting approval", color: "#E0A93B", bg: "rgba(224,169,59,0.12)" },
  "a-modifier": { label: "Needs changes",            color: "#D85A30", bg: "rgba(216,90,48,0.12)" },
  "validee":    { label: "Approved",                 color: "#1D9E75", bg: "rgba(29,158,117,0.12)" },
  "rejetee":    { label: "Rejected",                 color: "#E0524E", bg: "rgba(229,82,78,0.14)" },
  "exportee":   { label: "Exported",                 color: "#7A8190", bg: "rgba(122,129,144,0.14)" },
};

const JOUR_MS = 86_400_000;
/** StatutAO « vivants » : mêmes règles que GET /tableau-de-bord. */
export const STATUTS_ACTIFS = ["brut", "analyse", "a_repondre", "en_redaction"];

/**
 * Échéance d'un AO. `urgent` = échéance dans [maintenant, +7 j] (règle du backend) ;
 * `echu` = date passée ; `precisee` = false quand l'AO n'a pas de date limite.
 */
export function deadlineInfo(dateStr: string | null) {
  if (!dateStr) {
    return { formatted: "No deadline given", days: 0, urgent: false, echu: false, precisee: false };
  }
  const d = new Date(dateStr);
  const ms = d.getTime() - Date.now();
  const days = Math.ceil(ms / JOUR_MS);
  const formatted = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const urgent = ms >= 0 && ms <= 7 * JOUR_MS;
  return { formatted, days, urgent, echu: ms < 0, precisee: true };
}
