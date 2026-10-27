import { useEffect, useState } from "react";
import {
  getHermionUserContext,
  getProfileAvatarLetter,
  getProfileDisplayName,
  loadUserProfile,
  type UserProfile,
} from "../lib/userProfile";
import { Icon } from "../components/Icon";
import {
  chargerPreferencesBureau,
  enregistrerPreferencesBureau,
  estTauri,
  type PreferencesBureau,
} from "../lib/desktop";
import {
  installerMiseAJour,
  miseAJourSupportee,
  verifierMiseAJour,
  versionActuelle,
  type MiseAJourDisponible,
  type ProgressionMiseAJour,
} from "../lib/miseAJour";
import { ProfilMetierSection } from "../components/ProfilMetierSection";
import { WorkflowEditor, type WorkflowDraft } from "../components/WorkflowEditor";
import {
  api,
  type CapaciteArgos,
  type Calibration,
  type ConfigComposite,
  type SeuilsLaya,
  type ConfigLaya,
  type PrecisionLaya,
  type ConfigOrchestration,
  type CriteresAvances,
  type NatureMarche,
  type PortailArgos,
  type RapportOrchestration,
} from "../lib/api";

const NATURES: { id: NatureMarche; label: string }[] = [
  { id: "services", label: "Services" },
  { id: "travaux", label: "Works" },
  { id: "fournitures", label: "Supplies" },
];

type Props = {
  profile: UserProfile | null;
  onSaveProfile: (profile: UserProfile) => void;
};

type SectionId =
  | "profil"
  | "metier"
  | "portails"
  | "filtrage"
  | "scoring"
  | "redaction"
  | "pipeline"
  | "bureau";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "profil",    label: "User profile" },
  { id: "metier",    label: "Business profile" },
  { id: "portails",  label: "Portals" },
  { id: "filtrage",  label: "Filter criteria" },
  { id: "scoring",   label: "Scoring weights" },
  { id: "redaction", label: "HERMION drafting" },
  { id: "pipeline",  label: "Autonomous pipeline" },
  { id: "bureau",    label: "Desktop app" },
];

export function Settings({ profile, onSaveProfile }: Props) {
  const [section, setSection] = useState<SectionId>("profil");

  return (
    <div className="view">
      <div className="settings-layout">
        <nav className="settings-nav">
          <div className="nav-section-title" style={{ padding: "0 12px 8px" }}>
            Sections
          </div>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`settings-nav__item${
                section === s.id ? " settings-nav__item--active" : ""
              }`}
              onClick={() => setSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {section === "profil" && (
            <UserProfileSection profile={profile} onSave={onSaveProfile} />
          )}
          {section === "metier" && <ProfilMetierSection legacy={profile} />}
          {section === "portails" && <PortalsSection />}
          {section === "filtrage" && <FilteringSection />}
          {section === "scoring" && <ScoringSection />}
          {section === "redaction" && <RedactionSection />}
          {section === "pipeline" && <OrchestrationSection />}
          {section === "bureau" && <BureauSection />}
        </div>
      </div>
    </div>
  );
}

function UserProfileSection({
  profile,
  onSave,
}: {
  profile: UserProfile | null;
  onSave: (profile: UserProfile) => void;
}) {
  const [firstName, setFirstName] = useState(profile?.firstName ?? "");
  const [lastName, setLastName] = useState(profile?.lastName ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [entreprise, setEntreprise] = useState(profile?.entreprise ?? "");
  const [activite, setActivite] = useState(profile?.activite ?? "");
  const [infosUtiles, setInfosUtiles] = useState(profile?.infosUtiles ?? "");
  const preview: UserProfile = {
    firstName,
    lastName,
    email,
    entreprise,
    activite,
    infosUtiles,
  };
  const canSave = firstName.trim().length > 0 && lastName.trim().length > 0;

  return (
    <div className="settings-section">
      <h2>User profile</h2>
      <p className="settings-section__desc">
        Local identity and business context injected into the KRINOS (scoring)
        and HERMION (drafting) prompts. The more precise the information, the
        more relevant the AI output.
      </p>

      <div className="settings-row">
        <div>
          <div className="settings-row__label">Preview</div>
          <div className="settings-row__hint">Top bar and HERMION context</div>
        </div>
        <div className="profile-preview">
          <div className="topbar__user-avatar">{getProfileAvatarLetter(preview)}</div>
          <div>
            <div className="profile-preview__name">
              {canSave ? getProfileDisplayName(preview) : "User not configured"}
            </div>
            <div
              className="profile-preview__context"
              style={{ whiteSpace: "pre-line" }}
            >
              {canSave ? getHermionUserContext(preview) : "First and last name required"}
            </div>
          </div>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row__label">First name *</div>
        <input
          className="input"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-row__label">Last name *</div>
          <div className="settings-row__hint">Its first letter sets the avatar</div>
        </div>
        <input
          className="input"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-row__label">Email</div>
          <div className="settings-row__hint">Optional, used in exports and emails</div>
        </div>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-row__label">Company</div>
          <div className="settings-row__hint">Name of the organisation answering tenders</div>
        </div>
        <input
          className="input"
          value={entreprise}
          onChange={(e) => setEntreprise(e.target.value)}
          placeholder="e.g. ACME Consulting"
        />
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-row__label">Main business activity</div>
          <div className="settings-row__hint">In a few words</div>
        </div>
        <input
          className="input"
          value={activite}
          onChange={(e) => setActivite(e.target.value)}
          placeholder="e.g. Java/PostgreSQL IT services firm — public-sector project management"
        />
      </div>

      <div className="settings-row" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="settings-row__label">Useful information for the AI</div>
          <div className="settings-row__hint">
            References, certifications, team size…
          </div>
        </div>
        <textarea
          className="response-comment-input"
          style={{ minHeight: 100 }}
          value={infosUtiles}
          onChange={(e) => setInfosUtiles(e.target.value)}
          placeholder="e.g. 12 FTE, ISO 27001 certified, references: Naval Group (2024), CDC (2023). PASSI-qualified auditors."
        />
      </div>

      <div style={{ marginTop: 18 }}>
        <button
          className="btn btn--gold"
          disabled={!canSave}
          onClick={() =>
            onSave({
              firstName,
              lastName,
              email,
              entreprise,
              activite,
              infosUtiles,
            })
          }
        >
          Save profile
        </button>
      </div>
    </div>
  );
}

const SCRAPER_URLS: Record<string, string> = {
  koneps: "https://www.g2b.go.kr",
  banque_mondiale: "https://projects.worldbank.org",
};

const SCRAPER_LABELS: Record<string, { nom: string; detail: string }> = {
  koneps: {
    nom: "KONEPS · 나라장터",
    detail: "Korean public procurement (Public Procurement Service), via the data.go.kr OpenAPI",
  },
  banque_mondiale: {
    nom: "World Bank · Asia",
    detail: "Tenders of World Bank–financed projects in Asian countries (public API, no key)",
  },
};

function PortalsSection() {
  const [scrapers, setScrapers] = useState<string[]>([]);
  const [portails, setPortails] = useState<PortailArgos[]>([]);
  const [capacites, setCapacites] = useState<CapaciteArgos[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [scrapersData, portailsData, capacitesData] = await Promise.all([
        api.listerScrapersArgos(),
        api.listerPortailsArgos(),
        api.listerCapacitesArgos(),
      ]);
      setScrapers(scrapersData.disponibles);
      setPortails(portailsData);
      setCapacites(capacitesData);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const [cleKoneps, setCleKoneps] = useState("");
  const [infoCle, setInfoCle] = useState<string | null>(null);

  // La ligne portail doit exister avant d'y attacher une clé chiffrée.
  const assurerPortail = async (nom: string) => {
    const existant = portails.find((p) => p.nom === nom);
    if (existant) return existant;
    return api.enregistrerPortailArgos(nom, {
      url_base: SCRAPER_URLS[nom] ?? "",
      actif: true,
      frequence_minutes: 360,
    });
  };

  const enregistrerCle = async () => {
    const cle = cleKoneps.trim();
    if (!cle) return;
    setSaving("koneps");
    setError(null);
    setInfoCle(null);
    try {
      await assurerPortail("koneps");
      await api.enregistrerCredentialsPortail("koneps", { service_key: cle });
      setCleKoneps("");
      setInfoCle("Service key saved (encrypted on this computer).");
      setPortails(await api.listerPortailsArgos());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  };

  const supprimerCle = async () => {
    setSaving("koneps");
    setError(null);
    setInfoCle(null);
    try {
      await api.supprimerCredentialsPortail("koneps");
      setInfoCle("Service key removed.");
      setPortails(await api.listerPortailsArgos());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  };

  const toggle = async (nom: string, actif: boolean) => {
    const existant = portails.find((p) => p.nom === nom);
    setSaving(nom);
    setError(null);
    try {
      const updated = await api.enregistrerPortailArgos(nom, {
        url_base: existant?.url_base ?? SCRAPER_URLS[nom] ?? "",
        type: existant?.type ?? "public",
        actif,
        frequence_minutes: existant?.frequence_minutes ?? 360,
      });
      setPortails((rows) => {
        const others = rows.filter((p) => p.nom !== nom);
        return [...others, updated].sort((a, b) => a.nom.localeCompare(b.nom));
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="settings-section">
      <h2>Monitored portals</h2>
      <p className="settings-section__desc">
        ARGOS only collects portals that have a registered backend scraper.
        Adding a configuration row is not enough: each private portal needs its
        own implementation.
      </p>

      {loading ? (
        <div style={{ color: "var(--fg-3)", fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
          {scrapers.map((nom) => {
            const portail = portails.find((p) => p.nom === nom);
            const actif = portail?.actif ?? true;
            const cap = capacites.find((c) => c.portail === nom);
            return (
              <div className="portal-row" key={nom}>
                <div>
                  <div className="portal-row__name">
                    {SCRAPER_LABELS[nom]?.nom ?? nom.toUpperCase()}
                  </div>
                  <div className="portal-row__url">
                    {portail?.url_base ?? SCRAPER_URLS[nom] ?? "URL not configured"}
                  </div>
                  {SCRAPER_LABELS[nom] && (
                    <div className="settings-row__hint" style={{ marginTop: 2 }}>
                      {SCRAPER_LABELS[nom].detail}
                    </div>
                  )}
                  {cap && (
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        flexWrap: "wrap",
                        marginTop: 6,
                      }}
                    >
                      {cap.filtrage_serveur && <CapChip label="Server-side filtering" />}
                      {cap.pagination && <CapChip label="Pagination" />}
                      {cap.liens_documents && <CapChip label="Document links" />}
                      <CapChip label={`${cap.champs_filtrables.length} filterable fields`} />
                    </div>
                  )}
                </div>
                <span className="portal-row__count">
                  {portail ? (actif ? "Active" : "Inactive") : "Available"}
                </span>
                <span className="portal-row__sync">
                  {portail?.derniere_collecte
                    ? new Date(portail.derniere_collecte).toLocaleString("en-GB")
                    : "Never collected"}
                </span>
                <button
                  className={`toggle${actif ? " toggle--on" : ""}`}
                  onClick={() => void toggle(nom, !actif)}
                  role="switch"
                  aria-checked={actif}
                  disabled={saving === nom}
                  title={
                    actif
                      ? "Disable this portal in the ARGOS configuration"
                      : "Enable this portal in the ARGOS configuration"
                  }
                >
                  <div className="toggle__thumb" />
                </button>
              </div>
            );
          })}
          {scrapers.length === 0 && (
            <div style={{ color: "var(--fg-3)", fontSize: 13 }}>
              No ARGOS scraper registered in the backend.
            </div>
          )}
          {error && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: "rgba(220,80,80,0.10)",
                border: "1px solid rgba(220,80,80,0.30)",
                borderRadius: 6,
                fontSize: 12.5,
                color: "var(--fg-2)",
              }}
            >
              Error: {error}
            </div>
          )}
        </div>
      )}

      {scrapers.includes("koneps") && (
        <div className="settings-row">
          <div>
            <div className="settings-row__label">KONEPS service key (data.go.kr)</div>
            <div className="settings-row__hint">
              {portails.find((p) => p.nom === "koneps")?.credentials_configures
                ? "Key configured. Paste a new one to replace it."
                : "Required to collect KONEPS. Free: sign up on data.go.kr and request " +
                  "access to the API “조달청_나라장터 입찰공고정보서비스”, then paste " +
                  "the (decoding) service key here."}
            </div>
            {infoCle && (
              <div className="settings-row__hint" style={{ color: "var(--fg-2)" }}>
                {infoCle}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input"
              type="password"
              autoComplete="off"
              placeholder="Service key"
              value={cleKoneps}
              onChange={(e) => setCleKoneps(e.target.value)}
            />
            <button
              className="btn btn--gold"
              disabled={!cleKoneps.trim() || saving === "koneps"}
              onClick={() => void enregistrerCle()}
            >
              Save
            </button>
            {portails.find((p) => p.nom === "koneps")?.credentials_configures && (
              <button
                className="btn btn--ghost"
                disabled={saving === "koneps"}
                onClick={() => void supprimerCle()}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 14,
          padding: "10px 14px",
          background: "rgba(200,169,81,0.08)",
          border: "1px solid rgba(200,169,81,0.30)",
          borderRadius: 6,
          fontSize: 12,
          color: "var(--fg-2)",
          lineHeight: 1.5,
        }}
      >
        Private portals: the Playwright foundation and encrypted storage exist,
        but each portal still has to be coded and added to the ARGOS registry.
      </div>

      <div style={{ marginTop: 16 }}>
        <button className="btn btn--ghost" disabled title="Requires a dedicated backend scraper">
          <Icon.plus size={13} /> Add a private portal
        </button>
      </div>
    </div>
  );
}

function CapChip({ label }: { label: string }) {
  return (
    <span
      style={{
        fontSize: 10.5,
        fontFamily: "var(--font-mono)",
        color: "var(--fg-3)",
        border: "1px solid var(--line)",
        borderRadius: 4,
        padding: "2px 6px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function parseMotsCles(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function FilteringSection() {
  const [keywords, setKeywords] = useState("");
  const [excluded, setExcluded] = useState("");
  const [savedKeywords, setSavedKeywords] = useState("");
  const [savedExcluded, setSavedExcluded] = useState("");
  // Critères avancés (filtrage serveur KONEPS / Banque mondiale). Listes saisies en texte
  // séparé par des virgules ; natures en cases à cocher ; dates en ISO.
  const [cpv, setCpv] = useState("");
  const [descripteurs, setDescripteurs] = useState("");
  const [natures, setNatures] = useState<Set<NatureMarche>>(new Set());
  const [pays, setPays] = useState("");
  const [departements, setDepartements] = useState("");
  const [datePub, setDatePub] = useState("");
  const [deadlineMin, setDeadlineMin] = useState("");
  const [deadlineMax, setDeadlineMax] = useState("");
  const [savedAvanceJson, setSavedAvanceJson] = useState("");
  const [actif, setActif] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionMsg, setSuggestionMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const buildAvance = (): CriteresAvances => ({
    cpv: parseMotsCles(cpv),
    descripteurs: parseMotsCles(descripteurs),
    natures: NATURES.filter((n) => natures.has(n.id)).map((n) => n.id),
    pays: parseMotsCles(pays).map((p) => p.toUpperCase()),
    departements: parseMotsCles(departements),
    date_publication_depuis: datePub || null,
    deadline_min: deadlineMin || null,
    deadline_max: deadlineMax || null,
  });

  const appliquerAvance = (a: CriteresAvances) => {
    setCpv(a.cpv.join(", "));
    setDescripteurs(a.descripteurs.join(", "));
    setNatures(new Set(a.natures as NatureMarche[]));
    setPays(a.pays.join(", "));
    setDepartements(a.departements.join(", "));
    setDatePub(a.date_publication_depuis ?? "");
    setDeadlineMin(a.deadline_min ?? "");
    setDeadlineMax(a.deadline_max ?? "");
    // Référence pour `dirty` : sérialisée dans la même forme canonique que
    // `buildAvance` (natures en ordre NATURES, pays en majuscules) pour éviter
    // un état « modifié » fantôme juste après chargement.
    setSavedAvanceJson(
      JSON.stringify({
        cpv: a.cpv,
        descripteurs: a.descripteurs,
        natures: NATURES.filter((n) => a.natures.includes(n.id)).map((n) => n.id),
        pays: a.pays.map((p) => p.toUpperCase()),
        departements: a.departements,
        date_publication_depuis: a.date_publication_depuis ?? null,
        deadline_min: a.deadline_min ?? null,
        deadline_max: a.deadline_max ?? null,
      }),
    );
  };

  const toggleNature = (id: NatureMarche) =>
    setNatures((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const dirty =
    keywords !== savedKeywords ||
    excluded !== savedExcluded ||
    JSON.stringify(buildAvance()) !== savedAvanceJson;

  useEffect(() => {
    let cancelled = false;
    api
      .lireFiltreVeille()
      .then((f) => {
        if (cancelled) return;
        const inc = f.inclus.join(", ");
        const exc = f.exclus.join(", ");
        setKeywords(inc);
        setExcluded(exc);
        setSavedKeywords(inc);
        setSavedExcluded(exc);
        appliquerAvance(f.avance);
        setActif(f.actif);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      const reponse = await api.ecrireFiltreVeille({
        inclus: parseMotsCles(keywords),
        exclus: parseMotsCles(excluded),
        avance: buildAvance(),
      });
      const inc = reponse.inclus.join(", ");
      const exc = reponse.exclus.join(", ");
      setKeywords(inc);
      setExcluded(exc);
      setSavedKeywords(inc);
      setSavedExcluded(exc);
      appliquerAvance(reponse.avance);
      setActif(reponse.actif);
      setSavedMessage(
        reponse.actif
          ? "Filter saved — it will apply from the next ARGOS collection."
          : "Filter cleared — ARGOS collections will keep every tender.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const onSuggest = async () => {
    const profil = loadUserProfile();
    if (!profil || (!profil.entreprise.trim() && !profil.activite.trim())) {
      setError(
        "First fill in the company name and business activity in the " +
          "\"User profile\" section — the AI needs them to suggest keywords.",
      );
      return;
    }
    setSuggesting(true);
    setError(null);
    setSavedMessage(null);
    setSuggestionMsg(null);
    try {
      const suggestion = await api.suggererFiltreVeille({
        entreprise: profil.entreprise,
        activite: profil.activite,
        infos: profil.infosUtiles,
      });
      // Pré-remplit les textareas sans écraser si l'utilisateur veut fusionner :
      // on remplace pour rester clair (il peut éditer après).
      setKeywords(suggestion.inclus.join(", "));
      setExcluded(suggestion.exclus.join(", "));
      setSuggestionMsg(
        suggestion.raisonnement
          ? `${suggestion.inclus.length} include and ${suggestion.exclus.length} exclude keywords suggested. ${suggestion.raisonnement} — review, then save.`
          : `${suggestion.inclus.length} include and ${suggestion.exclus.length} exclude keywords suggested — review, then save.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className="settings-section">
      <h2>Filter criteria</h2>
      <p className="settings-section__desc">
        ARGOS filters collected tenders with these keywords before storing them in
        MNEMOSYNE. A tender is kept if at least one include keyword appears in its
        title, subject or issuer, and no exclude keyword does. Matching ignores case
        and accents. Keywords match the tender text, so write them in the portals'
        languages: Korean for KONEPS, English for the World Bank.
      </p>

      {loading ? (
        <div style={{ color: "var(--fg-3)", fontSize: 13 }}>Loading…</div>
      ) : (
        <>
          <div className="settings-row">
            <div>
              <div className="settings-row__label">Include keywords</div>
              <div className="settings-row__hint">
                Comma-separated. Empty = no include filter.
              </div>
            </div>
            <textarea
              className="response-comment-input"
              style={{ minHeight: 60 }}
              placeholder="e.g. 정보시스템 유지보수, 보안 컨설팅, system maintenance, cybersecurity"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
            />
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-row__label">Exclude keywords</div>
              <div className="settings-row__hint">
                Tenders containing these terms (title/subject/issuer) are discarded.
              </div>
            </div>
            <textarea
              className="response-comment-input"
              style={{ minHeight: 60 }}
              placeholder="e.g. 청소, 조경, cleaning, catering"
              value={excluded}
              onChange={(e) => setExcluded(e.target.value)}
            />
          </div>

          <div
            style={{
              marginTop: 20,
              paddingTop: 16,
              borderTop: "1px solid var(--line)",
            }}
          >
            <div className="settings-row__label" style={{ marginBottom: 4 }}>
              Advanced filters (server-side)
            </div>
            <div className="settings-row__hint" style={{ marginBottom: 14 }}>
              Sent to the portal APIs to target collection. Contract type applies
              to KONEPS (goods, services, works); countries apply to the World
              Bank; dates apply to both.
            </div>

            <div className="settings-row">
              <div>
                <div className="settings-row__label">Contract type</div>
                <div className="settings-row__hint">Empty = all types</div>
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {NATURES.map((n) => (
                  <label
                    key={n.id}
                    style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
                  >
                    <input
                      type="checkbox"
                      checked={natures.has(n.id)}
                      onChange={() => toggleNature(n.id)}
                    />
                    {n.label}
                  </label>
                ))}
              </div>
            </div>


            <div className="settings-row">
              <div>
                <div className="settings-row__label">Countries (World Bank)</div>
                <div className="settings-row__hint">
                  ISO3 codes of Asian countries, comma-separated. Default: all
                  of Asia
                </div>
              </div>
              <input
                className="input"
                placeholder="e.g. VNM, IDN, PHL, UZB"
                value={pays}
                onChange={(e) => setPays(e.target.value)}
              />
            </div>



            <div className="settings-row">
              <div>
                <div className="settings-row__label">Published since</div>
                <div className="settings-row__hint">
                  Only includes notices published from this date
                </div>
              </div>
              <input
                className="input"
                type="date"
                value={datePub}
                onChange={(e) => setDatePub(e.target.value)}
              />
            </div>

            <div className="settings-row">
              <div>
                <div className="settings-row__label">Deadline — between</div>
                <div className="settings-row__hint">
                  Response deadline window
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  className="input"
                  type="date"
                  value={deadlineMin}
                  onChange={(e) => setDeadlineMin(e.target.value)}
                />
                <span style={{ color: "var(--fg-3)", fontSize: 12 }}>and</span>
                <input
                  className="input"
                  type="date"
                  value={deadlineMax}
                  onChange={(e) => setDeadlineMax(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div style={{ marginTop: 18, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button
              className="btn btn--gold"
              disabled={saving || !dirty}
              onClick={onSave}
            >
              {saving
                ? "Saving…"
                : dirty
                  ? "Save filter"
                  : "No changes"}
            </button>
            <button
              className="btn"
              disabled={suggesting}
              onClick={onSuggest}
              title="Ask PYTHIA for relevant keywords based on your company profile"
            >
              <Icon.refresh size={11} />
              {suggesting ? "PYTHIA is thinking…" : "Suggest (AI)"}
            </button>
            {dirty && (
              <span
                style={{
                  fontSize: 12,
                  color: "var(--warn, #e0a93b)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                ● unsaved changes
              </span>
            )}
            <span
              style={{
                fontSize: 12,
                color: actif ? "var(--argos)" : "var(--fg-3)",
                fontFamily: "var(--font-mono)",
                marginLeft: "auto",
              }}
            >
              {actif ? "● filter active" : "○ filter inactive"}
            </span>
          </div>

          {suggestionMsg && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: "rgba(200,169,81,0.10)",
                border: "1px solid rgba(200,169,81,0.30)",
                borderRadius: 6,
                fontSize: 12.5,
                color: "var(--fg-2)",
                lineHeight: 1.5,
              }}
            >
              {suggestionMsg}
            </div>
          )}

          {savedMessage && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: "rgba(29,158,117,0.10)",
                border: "1px solid rgba(29,158,117,0.30)",
                borderRadius: 6,
                fontSize: 12.5,
                color: "var(--fg-2)",
              }}
            >
              {savedMessage}
            </div>
          )}
          {error && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: "rgba(220,80,80,0.10)",
                border: "1px solid rgba(220,80,80,0.30)",
                borderRadius: 6,
                fontSize: 12.5,
                color: "var(--fg-2)",
              }}
            >
              Error: {error}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const SCORING_DIMENSIONS: {
  id: keyof Omit<import("../lib/api").PonderationKrinos, "total">;
  label: string;
  desc: string;
}[] = [
  {
    id: "affinite_metier",
    label: "Business fit",
    desc: "Match with the company's activity / expertise",
  },
  {
    id: "references",
    label: "References",
    desc: "Ability to cite similar past references",
  },
  {
    id: "adequation_budget",
    label: "Budget fit",
    desc: "Contract size vs company capacity (neither too small nor too large)",
  },
  {
    id: "capacite_equipe",
    label: "Team capacity",
    desc: "Required team size / timelines vs available team",
  },
  {
    id: "calendrier",
    label: "Schedule risk",
    desc: "Realism of response and delivery timelines",
  },
];

function ScoringSection() {
  const [values, setValues] = useState<Record<string, number>>(
    Object.fromEntries(SCORING_DIMENSIONS.map((d) => [d.id, 0])),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedValues, setSavedValues] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const total = SCORING_DIMENSIONS.reduce((s, d) => s + (values[d.id] ?? 0), 0);
  const dirty = SCORING_DIMENSIONS.some((d) => values[d.id] !== savedValues[d.id]);
  const totalOk = total === 100;

  useEffect(() => {
    let cancelled = false;
    api
      .lirePonderation()
      .then((p) => {
        if (cancelled) return;
        const v: Record<string, number> = {
          affinite_metier: p.affinite_metier,
          references: p.references,
          adequation_budget: p.adequation_budget,
          capacite_equipe: p.capacite_equipe,
          calendrier: p.calendrier,
        };
        setValues(v);
        setSavedValues({ ...v });
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const reset = () => {
    const defaults = { affinite_metier: 30, references: 20, adequation_budget: 20, capacite_equipe: 15, calendrier: 15 };
    setValues(defaults);
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const sauvegarde = await api.ecrirePonderation({
        affinite_metier: values.affinite_metier,
        references: values.references,
        adequation_budget: values.adequation_budget,
        capacite_equipe: values.capacite_equipe,
        calendrier: values.calendrier,
      });
      const v = {
        affinite_metier: sauvegarde.affinite_metier,
        references: sauvegarde.references,
        adequation_budget: sauvegarde.adequation_budget,
        capacite_equipe: sauvegarde.capacite_equipe,
        calendrier: sauvegarde.calendrier,
      };
      setValues(v);
      setSavedValues({ ...v });
      setSavedMsg(
        sauvegarde.total === 100
          ? "Weights saved. They will be used from the next KRINOS analysis."
          : `Weights saved (total ${sauvegarde.total}% — the score will be normalised automatically).`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-section">
      <h2>Scoring weights</h2>
      <p className="settings-section__desc">
        KRINOS asks PYTHIA for a 0-100 score on each of these dimensions, then the
        backend computes the final score as a weighted sum. Target total: 100%
        (the score is re-normalised if the total differs).
      </p>

      {loading ? (
        <div style={{ color: "var(--fg-3)", fontSize: 13 }}>Loading…</div>
      ) : (
        <>
          {SCORING_DIMENSIONS.map((d) => (
            <div className="settings-row" key={d.id}>
              <div>
                <div className="settings-row__label">{d.label}</div>
                <div className="settings-row__hint">{d.desc}</div>
              </div>
              <div className="slider-row">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={values[d.id]}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [d.id]: +e.target.value }))
                  }
                />
                <div className="slider-row__val">{values[d.id]} %</div>
              </div>
            </div>
          ))}

          <div
            style={{
              marginTop: 18,
              padding: "12px 16px",
              background: totalOk ? "rgba(29,158,117,0.10)" : "rgba(224,169,59,0.10)",
              border: `1px solid ${
                totalOk ? "rgba(29,158,117,0.30)" : "rgba(224,169,59,0.30)"
              }`,
              borderRadius: 6,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 12.5 }}>
              Total:{" "}
              <strong
                style={{
                  color: totalOk ? "var(--argos)" : "var(--warn)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {total} %
              </strong>
              {!totalOk && (
                <span style={{ color: "var(--fg-3)", marginLeft: 8 }}>
                  — will be re-normalised to 100% on save
                </span>
              )}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn--sm" onClick={reset}>
                Reset
              </button>
              <button
                className="btn btn--gold btn--sm"
                disabled={saving || !dirty}
                onClick={onSave}
              >
                {saving ? "Saving…" : dirty ? "Save" : "No changes"}
              </button>
            </div>
          </div>

          {savedMsg && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: "rgba(29,158,117,0.10)",
                border: "1px solid rgba(29,158,117,0.30)",
                borderRadius: 6,
                fontSize: 12.5,
                color: "var(--fg-2)",
              }}
            >
              {savedMsg}
            </div>
          )}
          {error && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: "rgba(220,80,80,0.10)",
                border: "1px solid rgba(220,80,80,0.30)",
                borderRadius: 6,
                fontSize: 12.5,
                color: "var(--fg-2)",
              }}
            >
              Error: {error}
            </div>
          )}

          <div
            style={{
              marginTop: 18,
              fontSize: 11.5,
              color: "var(--fg-4)",
              lineHeight: 1.6,
            }}
          >
            Note: tenders already analysed keep their original score. To
            recalculate a score with the new weights without re-running PYTHIA,
            open the tender in Tenders and use the "Recalculate score" action if
            the analysis contains per-dimension scores.
          </div>
        </>
      )}
    </div>
  );
}

function RedactionSection() {
  const [draft, setDraft] = useState<WorkflowDraft>({
    consignes_globales: "",
    sections: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .lireWorkflowHermion()
      .then((wf) => {
        if (cancelled) return;
        setDraft({
          consignes_globales: wf.consignes_globales,
          sections: wf.sections,
        });
        setSource(wf.configure ? wf.source : "");
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const wf = await api.ecrireWorkflowHermion({
        consignes_globales: draft.consignes_globales,
        sections: draft.sections,
      });
      setDraft({ consignes_globales: wf.consignes_globales, sections: wf.sections });
      setSource(wf.configure ? wf.source : "");
      setSavedMsg(
        wf.configure
          ? `Workflow saved (${wf.sections.length} sections) — HERMION will use it from the next draft.`
          : "Workflow cleared — HERMION will build a dynamic outline for each tender.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-section">
      <h2>HERMION drafting</h2>
      <p className="settings-section__desc">
        Response outline imposed on HERMION: an ordered list of sections plus
        global instructions. You can derive it with AI from a description or past
        responses, then correct it. Without a workflow, HERMION builds a dynamic
        outline for each tender.
      </p>

      {loading ? (
        <div style={{ color: "var(--fg-3)", fontSize: 13 }}>Loading…</div>
      ) : (
        <>
          {source && (
            <div
              style={{
                marginBottom: 12,
                fontSize: 12,
                color: "var(--fg-3)",
                fontFamily: "var(--font-mono)",
              }}
            >
              ● workflow active — source: {source}
            </div>
          )}

          <WorkflowEditor value={draft} onChange={setDraft} />

          <div style={{ marginTop: 18, display: "flex", gap: 12, alignItems: "center" }}>
            <button className="btn btn--gold" disabled={saving} onClick={onSave}>
              {saving ? "Saving…" : "Save workflow"}
            </button>
            <span style={{ fontSize: 11.5, color: "var(--fg-4)" }}>
              Saving with zero sections disables the workflow.
            </span>
          </div>

          {savedMsg && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: "rgba(29,158,117,0.10)",
                border: "1px solid rgba(29,158,117,0.30)",
                borderRadius: 6,
                fontSize: 12.5,
                color: "var(--fg-2)",
              }}
            >
              {savedMsg}
            </div>
          )}
          {error && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: "rgba(220,80,80,0.10)",
                border: "1px solid rgba(220,80,80,0.30)",
                borderRadius: 6,
                fontSize: 12.5,
                color: "var(--fg-2)",
              }}
            >
              Error: {error}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const CFG_DEFAUT: ConfigOrchestration = {
  actif: true,
  seuil_score: 70,
  auto_rediger: true,
  max_par_cycle: 5,
};

const GO = 1024 * 1024 * 1024;
const formatGo = (octets: number) => `${(octets / GO).toFixed(2)} GB`;
const formatTaille = (octets: number) =>
  octets >= GO ? formatGo(octets) : octets >= 1024 * 1024 ? `${(octets / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(octets / 1024)} KB`;

/**
 * Juge Laya (local, ONNX) : état du modèle, téléchargement consenti avec progression,
 * activation et température de calibration. Rien n'est téléchargé sans clic confirmé.
 */
function LayaReglage() {
  const [cfg, setCfg] = useState<ConfigLaya | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [temperature, setTemperature] = useState(1);

  useEffect(() => {
    let cancelled = false;
    api
      .lireConfigLaya()
      .then((c) => {
        if (cancelled) return;
        setCfg(c);
        setTemperature(c.temperature);
      })
      .catch((e) => {
        if (!cancelled) setErreur(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Suivi par polling tant qu'un téléchargement est en cours.
  const enCours = cfg?.modele.progression.en_cours === true;
  useEffect(() => {
    if (!enCours) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      api
        .lireConfigLaya()
        .then((c) => {
          if (!cancelled) setCfg(c);
        })
        .catch(() => undefined);
    }, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enCours]);

  if (!cfg) return erreur ? <div className="settings-row__hint">{erreur}</div> : null;

  const agir = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setErreur(null);
    try {
      await action();
      const c = await api.lireConfigLaya();
      setCfg(c);
      setTemperature(c.temperature);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const modele = cfg.modele;
  const prog = modele.progression;
  const installe = modele.installe;

  const aReinstaller = modele.a_reinstaller.length > 0;

  const telecharger = () => {
    const liste = modele.fichiers_concernes
      .map((f) => `  - ${f.chemin} (${formatTaille(f.taille_octets)})`)
      .join("\n");
    const intro = aReinstaller
      ? `Reinstall the Laya model (${modele.precision}): ${modele.fichiers_concernes.length} ` +
        `file(s) to download again, ${formatTaille(modele.taille_a_telecharger_octets)} in total:\n` +
        `${liste}\n\nOnly these files are downloaded again. `
      : `Download the Laya model (${modele.precision}): ${modele.fichiers_concernes.length} ` +
        `file(s), ${formatTaille(modele.taille_a_telecharger_octets)} in total:\n${liste}\n\n`;
    const ok = window.confirm(
      intro +
        "Source: Hugging Face (onnx-community/laya-multilingual-ONNX repository, pinned version, " +
        "SHA-256 checksums verified). This is Laya's only external call: afterwards " +
        `it runs entirely on this machine. Free space: ${formatGo(modele.espace_disque_libre_octets)}.`,
    );
    if (ok) void agir(() => api.telechargerModeleLaya(modele.precision));
  };

  return (
    <section className="settings-carte" aria-label="Laya judge">
      <div className="settings-carte__tete">
        <div>
          <div className="settings-row__label">Laya judge (local) — optional</div>
          <div className="settings-row__hint">
            Second opinion on the KRINOS score, computed on this machine: no key, no budget,
            nothing leaves the computer. A gap with PYTHIA, low confidence or a manipulation
            attempt flags the tender as "needs review".
            {erreur ? ` ${erreur}` : ""}
          </div>
          <details className="settings-carte__details">
            <summary>Learn more</summary>
            <div className="settings-row__hint">
              Open-source Laya model (Convai Innovations, Apache 2.0), run by ONNX Runtime inside
              the HERMES backend. It judges every portal, public or private. Its files are checked
              with SHA-256 when HERMES starts (in the background, if Laya is enabled), on demand
              ("Verify integrity") and on first load; on any mismatch the model is refused and must
              be reinstalled, with your consent.
            </div>
          </details>
        </div>
        <button
          className={`toggle${cfg.actif ? " toggle--on" : ""}`}
          onClick={() => void agir(() => api.ecrireConfigLaya({ actif: !cfg.actif }))}
          disabled={busy || (!installe && !cfg.actif)}
          role="switch"
          aria-checked={cfg.actif}
          title={installe ? undefined : "Install the model first"}
        >
          <div className="toggle__thumb" />
        </button>
      </div>

      <div className="settings-row__hint">
        <strong>Model:</strong>{" "}
        {installe
          ? `installed (${modele.precision}, ${formatGo(modele.taille_octets)}) — ${modele.dossier}`
          : aReinstaller
            ? `needs reinstalling (${modele.precision}) — ${formatTaille(modele.taille_a_telecharger_octets)} to download`
            : `not installed — ${formatGo(modele.taille_octets)} to download (${modele.precision})`}
        {cfg.actif && !cfg.operationnel && aReinstaller && " — enabled, but blocked: the model must be reinstalled."}
        {cfg.actif && !cfg.operationnel && !aReinstaller && " — enabled, but unusable while the model is missing."}
        {cfg.operationnel && " — operational."}
      </div>

      {aReinstaller && (
        <div className="settings-carte__alerte" role="alert">
          Integrity check failed: {modele.a_reinstaller.join(", ")} no longer matches the
          expected SHA-256 checksum.{" "}
          {cfg.actif ? "Laya is enabled, but blocked" : "Laya stays disabled"} until the model
          is reinstalled; nothing is downloaded again without your consent.
        </div>
      )}

      {(installe || aReinstaller) && !prog.en_cours && (
        <div className="settings-carte__actions">
          <button
            className="btn"
            disabled={busy}
            onClick={() => void agir(() => api.verifierIntegriteLaya())}
          >
            Verify integrity
          </button>
          <span className="settings-row__hint">
            {modele.verifie_le
              ? `Last checked: ${new Date(modele.verifie_le).toLocaleString("en-GB")}`
              : "Not checked since startup."}
          </span>
        </div>
      )}

      {!installe && !prog.en_cours && (
        <div className="settings-carte__actions">
          <label className="settings-row__hint">
            Precision{" "}
            <select
              className="input"
              value={cfg.precision}
              disabled={busy}
              onChange={(e) =>
                void agir(() => api.ecrireConfigLaya({ precision: e.target.value as PrecisionLaya }))
              }
            >
              <option value="fp16">fp16 (~0.7 GB, recommended)</option>
              <option value="fp32">fp32 (~1.3 GB)</option>
            </select>
          </label>
          <button className="btn btn--gold" disabled={busy} onClick={telecharger}>
            {aReinstaller ? "Reinstall model" : "Download model"}
          </button>
        </div>
      )}

      {prog.en_cours && (
        <div>
          <div
            style={{
              width: "100%",
              height: 12,
              background: "var(--bg-2)",
              border: "1px solid var(--line)",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${prog.pourcent}%`,
                height: "100%",
                background: "var(--gold)",
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <div
            className="settings-row__hint"
            style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}
          >
            <span>
              {formatGo(prog.octets_telecharges)} / {formatGo(prog.octets_total)}
              {prog.fichier ? ` — ${prog.fichier}` : ""}
            </span>
            <span>{prog.pourcent.toFixed(1)} %</span>
          </div>
          <button
            className="btn"
            style={{ marginTop: 6 }}
            onClick={() => void agir(() => api.annulerTelechargementLaya())}
          >
            Cancel download
          </button>
        </div>
      )}
      {prog.erreur && !prog.en_cours && (
        <div className="settings-row__hint" style={{ color: "var(--err)" }}>
          Download failed: {prog.erreur}
        </div>
      )}

      <label className="settings-row__hint">
        Calibration temperature: {temperature.toFixed(1)}{" "}
        <input
          type="range"
          min={0.5}
          max={5}
          step={0.1}
          value={temperature}
          disabled={busy}
          onChange={(e) => setTemperature(Number(e.target.value))}
          onMouseUp={() => void agir(() => api.ecrireConfigLaya({ temperature }))}
          onKeyUp={() => void agir(() => api.ecrireConfigLaya({ temperature }))}
        />
        <span style={{ display: "block" }}>
          Above 1, probabilities are flattened (confidence drops, more tenders become
          "needs review"). 1 = raw outputs.
        </span>
      </label>
    </section>
  );
}

/** Juge local PYTHIA anti-manipulation : actif par défaut, 100 % hors ligne. */
function JugeLocalReglage() {
  const [actif, setActif] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .lireConfigJugeLocal()
      .then((c) => {
        if (!cancelled) setActif(c.actif);
      })
      .catch((e) => {
        if (!cancelled) setErreur(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (actif === null) return erreur ? <div className="settings-row__hint">{erreur}</div> : null;

  const basculer = async () => {
    setBusy(true);
    setErreur(null);
    try {
      setActif((await api.ecrireConfigJugeLocal(!actif)).actif);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-carte settings-carte--ligne" aria-label="PYTHIA local judge">
      <div>
        <div className="settings-row__label">Local anti-manipulation judge (PYTHIA)</div>
        <div className="settings-row__hint">
          A short PYTHIA call checks that the tender file does not try to manipulate the
          automatic evaluation. Offline; a detection flags the tender as "needs review".
          {erreur ? ` ${erreur}` : ""}
        </div>
        <details className="settings-carte__details">
          <summary>Learn more</summary>
          <div className="settings-row__hint">
            It catches rephrasings the local patterns miss. It works on every portal and sends
            nothing off the machine.
          </div>
        </details>
      </div>
      <button
        className={`toggle${actif ? " toggle--on" : ""}`}
        onClick={basculer}
        disabled={busy}
        role="switch"
        aria-checked={actif}
      >
        <div className="toggle__thumb" />
      </button>
    </section>
  );
}

/** Pré-tri de pertinence Laya avant KRINOS : désactivé par défaut, tous portails. */
function LayaPretriReglage() {
  const [cfg, setCfg] = useState<ConfigLaya | null>(null);
  const [seuil, setSeuil] = useState(30);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .lireConfigLaya()
      .then((c) => {
        if (cancelled) return;
        setCfg(c);
        setSeuil(Math.round((c.pretri_seuil ?? 0.3) * 100));
      })
      .catch((e) => {
        if (!cancelled) setErreur(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!cfg) return erreur ? <div className="settings-row__hint">{erreur}</div> : null;

  const enregistrer = async (actif: boolean, pct: number) => {
    setBusy(true);
    setErreur(null);
    try {
      setCfg(await api.ecrireConfigPretriLaya(actif, pct / 100));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-carte settings-carte--ligne" aria-label="Laya pre-screening">
      <div>
        <div className="settings-row__label">Laya relevance pre-screening — optional</div>
        <div className="settings-row__hint">
          Before KRINOS, Laya judges how relevant each tender is to your profile; below the
          threshold, the tender is marked "off-profile (Laya)" and PYTHIA does not analyse it.
          {erreur ? ` ${erreur}` : ""}
        </div>
        <details className="settings-carte__details">
          <summary>Learn more</summary>
          <div className="settings-row__hint">
            The tender stays visible and you can force the analysis. On failure or missing model:
            normal analysis. Requires Laya to be enabled and installed.
          </div>
        </details>
        <label className="settings-row__hint">
          Relevance threshold: {seuil}%{" "}
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={seuil}
            disabled={busy}
            onChange={(e) => setSeuil(Number(e.target.value))}
            onMouseUp={() => void enregistrer(cfg.pretri_actif === true, seuil)}
            onKeyUp={() => void enregistrer(cfg.pretri_actif === true, seuil)}
          />
        </label>
      </div>
      <button
        className={`toggle${cfg.pretri_actif ? " toggle--on" : ""}`}
        onClick={() => void enregistrer(!cfg.pretri_actif, seuil)}
        disabled={busy}
        role="switch"
        aria-checked={cfg.pretri_actif === true}
      >
        <div className="toggle__thumb" />
      </button>
    </section>
  );
}

const CHAMPS_SEUILS: { id: keyof SeuilsLaya; label: string; max: number; pas: number }[] = [
  { id: "divergence", label: "Laya/PYTHIA divergence (points)", max: 100, pas: 1 },
  { id: "manipulation", label: "Manipulation (probability)", max: 1, pas: 0.05 },
  { id: "pertinence", label: "Minimum relevance (probability)", max: 1, pas: 0.05 },
  { id: "confiance", label: "Minimum Laya confidence", max: 1, pas: 0.05 },
];

const CHAMPS_COMPOSITE: { id: keyof ConfigComposite; label: string }[] = [
  { id: "poids_pythia", label: "PYTHIA weight" },
  { id: "poids_laya", label: "Laya weight" },
  { id: "poids_pertinence", label: "Laya relevance weight" },
  { id: "seuil_go", label: "Composite \"go\" threshold" },
];

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

/** Seuils de routage Laya, pondérations du composite go/no-go et calibration (lecture seule). */
function LayaSeuilsEtCalibration() {
  const [seuils, setSeuils] = useState<SeuilsLaya | null>(null);
  const [composite, setComposite] = useState<ConfigComposite | null>(null);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.lireSeuilsLaya(), api.lireComposite(), api.lireCalibration()])
      .then(([s, c, k]) => {
        setSeuils(s);
        setComposite(c);
        setCalibration(k);
      })
      .catch((e) => setMessage(e instanceof Error ? e.message : String(e)));
  }, []);

  if (!seuils || !composite)
    return message ? <div className="settings-row__hint">{message}</div> : null;

  const enregistrer = async () => {
    setBusy(true);
    setMessage(null);
    try {
      setSeuils(await api.ecrireSeuilsLaya(seuils));
      setComposite(await api.ecrireComposite(composite));
      setCalibration(await api.lireCalibration());
      setMessage("Settings saved (applied to the next analyses and recalculations).");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div className="settings-row__label">Laya: routing thresholds and composite score</div>
      <div className="settings-row__hint">
        Past these thresholds, the tender is flagged "needs review" (human decision, never
        automatic promotion). The composite (PYTHIA + Laya + relevance) is indicative and is
        recalculated without a new Laya inference.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
        {CHAMPS_SEUILS.map((c) => (
          <label key={c.id} className="settings-row__hint">
            {c.label}
            <input
              className="input"
              type="number"
              min={0}
              max={c.max}
              step={c.pas}
              value={seuils[c.id]}
              onChange={(e) => setSeuils({ ...seuils, [c.id]: +e.target.value })}
            />
          </label>
        ))}
        {CHAMPS_COMPOSITE.map((c) => (
          <label key={c.id} className="settings-row__hint">
            {c.label}
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              step={5}
              value={composite[c.id]}
              onChange={(e) => setComposite({ ...composite, [c.id]: +e.target.value })}
            />
          </label>
        ))}
      </div>
      <div style={{ marginTop: 8, display: "flex", gap: 12, alignItems: "center" }}>
        <button className="btn btn--gold" disabled={busy} onClick={enregistrer}>
          Save
        </button>
        {message && <span className="settings-row__hint">{message}</span>}
      </div>

      {calibration && (
        <div className="settings-row__hint" style={{ marginTop: 12 }}>
          <strong>Calibration (read-only)</strong> — {calibration.echantillon.total} tenders
          decided ({calibration.echantillon.acceptes} accepted, {calibration.echantillon.rejetes}{" "}
          rejected, {calibration.echantillon.avec_laya} with a Laya opinion). Mean Laya/PYTHIA gap:{" "}
          {calibration.ecart_moyen_laya_pythia ?? "—"} pts.
          <ul style={{ margin: "4px 0 0 16px" }}>
            {(["pythia", "laya", "composite"] as const).map((k) => (
              <li key={k}>
                {k === "pythia" ? "PYTHIA" : k === "laya" ? "Laya" : "Composite"}: agreement{" "}
                {pct(calibration.sources[k].taux_accord)} at threshold {calibration.seuil_go} (n=
                {calibration.sources[k].n})
                {calibration.sources[k].n > 0 &&
                  "; by threshold: " +
                    calibration.sources[k].matrice
                      .map((m) => `${m.seuil}→${pct(m.taux_accord)}`)
                      .join(", ")}
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 4 }}>{calibration.heuristique}</div>
        </div>
      )}
    </div>
  );
}

function OrchestrationSection() {
  const [cfg, setCfg] = useState<ConfigOrchestration>(CFG_DEFAUT);
  const [saved, setSaved] = useState<ConfigOrchestration>(CFG_DEFAUT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [rapport, setRapport] = useState<RapportOrchestration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const dirty = JSON.stringify(cfg) !== JSON.stringify(saved);

  useEffect(() => {
    let cancelled = false;
    api
      .lireConfigOrchestration()
      .then((c) => {
        if (cancelled) return;
        setCfg(c);
        setSaved(c);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const c = await api.ecrireConfigOrchestration(cfg);
      setCfg(c);
      setSaved(c);
      setSavedMsg(
        c.actif
          ? "Configuration saved — the pipeline will run after each ARGOS cycle."
          : "Pipeline disabled — no automatic analysis/drafting.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const onRun = async () => {
    setRunning(true);
    setError(null);
    setRapport(null);
    try {
      setRapport(await api.lancerPipeline());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="settings-section">
      <h2>Autonomous pipeline</h2>
      <p className="settings-section__desc">
        Without human intervention, after each ARGOS collection: KRINOS analysis
        (score, tags, summary), then HERMION drafting for tenders above the
        threshold. The response stops at "pending" — final approval stays
        exclusively human.
      </p>

      {loading ? (
        <div style={{ color: "var(--fg-3)", fontSize: 13 }}>Loading…</div>
      ) : (
        <>
          <div className="settings-row">
            <div>
              <div className="settings-row__label">Pipeline enabled</div>
              <div className="settings-row__hint">
                Master switch for autonomy
              </div>
            </div>
            <button
              className={`toggle${cfg.actif ? " toggle--on" : ""}`}
              onClick={() => setCfg({ ...cfg, actif: !cfg.actif })}
              role="switch"
              aria-checked={cfg.actif}
            >
              <div className="toggle__thumb" />
            </button>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-row__label">Drafting threshold</div>
              <div className="settings-row__hint">
                Minimum KRINOS score to hand a tender to HERMION
              </div>
            </div>
            <div className="slider-row">
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={cfg.seuil_score}
                onChange={(e) =>
                  setCfg({ ...cfg, seuil_score: +e.target.value })
                }
              />
              <div className="slider-row__val">{cfg.seuil_score} / 100</div>
            </div>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-row__label">Automatic drafting</div>
              <div className="settings-row__hint">
                If disabled: KRINOS analyses, but HERMION does not draft on its own
              </div>
            </div>
            <button
              className={`toggle${cfg.auto_rediger ? " toggle--on" : ""}`}
              onClick={() =>
                setCfg({ ...cfg, auto_rediger: !cfg.auto_rediger })
              }
              role="switch"
              aria-checked={cfg.auto_rediger}
            >
              <div className="toggle__thumb" />
            </button>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-row__label">Max tenders per cycle</div>
              <div className="settings-row__hint">
                Caps the PYTHIA load on each run (1-50)
              </div>
            </div>
            <input
              className="input"
              style={{ width: 90 }}
              type="number"
              min={1}
              max={50}
              value={cfg.max_par_cycle}
              onChange={(e) =>
                setCfg({ ...cfg, max_par_cycle: +e.target.value })
              }
            />
          </div>

          <LayaReglage />
          <JugeLocalReglage />
          <LayaPretriReglage />
          <LayaSeuilsEtCalibration />

          <div style={{ marginTop: 18, display: "flex", gap: 12, alignItems: "center" }}>
            <button
              className="btn btn--gold"
              disabled={saving || !dirty}
              onClick={onSave}
            >
              {saving
                ? "Saving…"
                : dirty
                  ? "Save"
                  : "No changes"}
            </button>
            <button className="btn" disabled={running} onClick={onRun}>
              {running ? "Pipeline running…" : "Run the pipeline now"}
            </button>
          </div>

          {rapport && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: "rgba(29,158,117,0.10)",
                border: "1px solid rgba(29,158,117,0.30)",
                borderRadius: 6,
                fontSize: 12.5,
                color: "var(--fg-2)",
                lineHeight: 1.6,
              }}
            >
              {rapport.actif
                ? `${rapport.ao_analyses} analysed, ${rapport.ao_rediges} sent to drafting, ${rapport.ao_sous_seuil} below threshold, ${rapport.ao_a_verifier ?? 0} need review (KRINOS flags), ${rapport.ao_echecs} failures.`
                : "Pipeline disabled — nothing was processed."}
            </div>
          )}
          {savedMsg && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: "rgba(29,158,117,0.10)",
                border: "1px solid rgba(29,158,117,0.30)",
                borderRadius: 6,
                fontSize: 12.5,
                color: "var(--fg-2)",
              }}
            >
              {savedMsg}
            </div>
          )}
          {error && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: "rgba(220,80,80,0.10)",
                border: "1px solid rgba(220,80,80,0.30)",
                borderRadius: 6,
                fontSize: 12.5,
                color: "var(--fg-2)",
              }}
            >
              Error: {error}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const REGLAGES_BUREAU: { cle: keyof PreferencesBureau; label: string; hint: string }[] = [
  { cle: "nouvelAo", label: "New relevant tender", hint: "KRINOS score above the pipeline threshold" },
  { cle: "reponsePrete", label: "HERMION response ready", hint: "A response is awaiting your approval" },
  { cle: "panneArgos", label: "ARGOS failure", hint: "A collection run failed" },
  {
    cle: "reduireDansTray",
    label: "Closing the window keeps HERMES in the menu bar / system tray",
    hint: "HERMES keeps watching; \"Quit\" (icon menu) stops everything",
  },
  {
    cle: "verifierMajAuDemarrage",
    label: "Check for updates at startup",
    hint: "Contacts GitHub Releases only (no HERMES data is sent). Off by default",
  },
];

function BureauSection() {
  const [prefs, setPrefs] = useState<PreferencesBureau>(() => chargerPreferencesBureau());
  const bureau = estTauri();

  const changer = (cle: keyof PreferencesBureau) => {
    const suivant = { ...prefs, [cle]: !prefs[cle] };
    setPrefs(suivant);
    enregistrerPreferencesBureau(suivant);
  };

  return (
    <div className="settings-section">
      <h2>Desktop app</h2>
      <p className="settings-section__desc">
        System notifications and menu bar / system tray icon. Everything stays local to this machine.
        {!bureau && " These settings only apply in the HERMES desktop app."}
      </p>
      <MiseAJourCarte />
      {REGLAGES_BUREAU.map((r) => (
        <div className="settings-row" key={r.cle}>
          <div>
            <div className="settings-row__label">{r.label}</div>
            <div className="settings-row__hint">{r.hint}</div>
          </div>
          <button
            className={`toggle${prefs[r.cle] ? " toggle--on" : ""}`}
            onClick={() => changer(r.cle)}
            role="switch"
            aria-checked={prefs[r.cle]}
          >
            <div className="toggle__thumb" />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Mise à jour intégrée (macOS) : vérification sur clic, installation puis redémarrage. */
function MiseAJourCarte() {
  const [version, setVersion] = useState<string | null>(null);
  const [etat, setEtat] = useState<
    "inactif" | "verification" | "a_jour" | "disponible" | "installation" | "erreur"
  >("inactif");
  const [maj, setMaj] = useState<MiseAJourDisponible | null>(null);
  const [progression, setProgression] = useState<ProgressionMiseAJour | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    versionActuelle()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, []);

  if (!miseAJourSupportee()) return null;

  const verifier = async () => {
    setEtat("verification");
    setErreur(null);
    try {
      const trouvee = await verifierMiseAJour();
      setMaj(trouvee);
      setEtat(trouvee ? "disponible" : "a_jour");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      setEtat("erreur");
    }
  };

  const installer = async () => {
    setEtat("installation");
    setErreur(null);
    try {
      await installerMiseAJour(setProgression);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      setEtat("erreur");
    }
  };

  const pourcent =
    progression?.total ? Math.min(100, (progression.recus / progression.total) * 100) : null;

  return (
    <section className="settings-carte" aria-label="Updates">
      <div className="settings-carte__tete">
        <div>
          <div className="settings-row__label">Updates</div>
          <div className="settings-row__hint">
            Installed version: <strong>{version ?? "—"}</strong>. HERMES downloads the new
            version from GitHub Releases, checks its signature, replaces the app and restarts —
            no need to download the DMG again. Your data is kept.
          </div>
        </div>
        <button
          className="btn"
          disabled={etat === "verification" || etat === "installation"}
          onClick={() => void verifier()}
        >
          {etat === "verification" ? "Checking…" : "Check for updates"}
        </button>
      </div>

      {etat === "a_jour" && <div className="settings-row__hint">HERMES is up to date.</div>}

      {(etat === "disponible" || etat === "installation") && maj && (
        <div>
          <div className="settings-row__hint">
            <strong>HERMES {maj.version}</strong> is available
            {maj.date ? ` (published ${new Date(maj.date).toLocaleDateString("en-GB")})` : ""}.
          </div>
          {maj.notes && (
            <details className="settings-carte__details">
              <summary>Release notes</summary>
              <div className="settings-row__hint" style={{ whiteSpace: "pre-line" }}>
                {maj.notes}
              </div>
            </details>
          )}
          <div className="settings-carte__actions">
            <button
              className="btn btn--gold"
              disabled={etat === "installation"}
              onClick={() => void installer()}
            >
              {etat === "installation"
                ? pourcent !== null
                  ? `Downloading… ${pourcent.toFixed(0)}%`
                  : "Installing…"
                : "Install and restart"}
            </button>
            <span className="settings-row__hint">
              HERMES stops its agents, installs the update and reopens.
            </span>
          </div>
        </div>
      )}

      {erreur && (
        <div className="settings-row__hint" style={{ color: "var(--err)" }}>
          Update failed: {erreur}
        </div>
      )}
    </section>
  );
}
