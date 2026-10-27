import { useState } from "react";
import { HermesMark } from "./HermesMark";
import { Icon } from "./Icon";
import { ModaleFond, ModalePanneau } from "./Modale";
import { WorkflowEditor, type WorkflowDraft } from "./WorkflowEditor";
import { api } from "../lib/api";
import { saveUserProfile, markOnboardingDone, type UserProfile } from "../lib/userProfile";

type Step = 1 | 2 | 3 | 4;

type Props = {
  onDone: (profile: UserProfile) => void;
};

// Préset métier par défaut (déploiement mono-utilisateur : commercial
// LinkMobility — CPaaS / messagerie mobile). Éditable à l'onboarding et dans
// Paramètres. Centralisé ici pour être ajusté facilement si la cible change.
// Bilingue : coréen pour KONEPS (나라장터), anglais pour la Banque mondiale.
// Termes précis plutôt que génériques — ex. on n'exclut pas « 공사 » (travaux),
// qui figure aussi dans le nom des entreprises publiques (한국전력공사).
const PRESET_INCLUS =
  "문자메시지, 문자 발송, 대량문자, 알림톡, 카카오 알림톡, SMS, RCS, " +
  "메시징 서비스, 본인인증, OTP, 통합메시징, 모바일 메시지, " +
  "SMS service, bulk SMS, mobile messaging, messaging platform, CPaaS, " +
  "notification service, two-factor authentication";

const PRESET_EXCLUS =
  "청소, 조경, 급식, 건설공사, 광케이블, 통신장비, 전화기, " +
  "cleaning, catering, landscaping, civil works, fibre optic cable";

function parseMotsCles(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Wizard d'onboarding au tout premier lancement de HERMES.
 *
 * 4 étapes avant que l'utilisateur puisse utiliser l'app :
 *   1. Identité (prénom, nom, email)
 *   2. Entreprise (nom, activité, infos utiles pour l'IA)
 *   3. Critères de veille initiaux (mots-clés inclus/exclus)
 *   4. Workflow de rédaction HERMION (dérivé par l'IA puis corrigé) —
 *      facultatif, modifiable ensuite dans Paramètres.
 *
 * À la fin, on persiste le profil en localStorage, les mots-clés via
 * PUT /argos/filtre, et le workflow (s'il y en a un) via
 * PUT /hermion/workflow. Ainsi MNEMOSYNE est alimentée dès le départ.
 */
export function OnboardingWizard({ onDone }: Props) {
  const [step, setStep] = useState<Step>(1);

  // Étape 1
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  // Étape 2
  const [entreprise, setEntreprise] = useState("");
  const [activite, setActivite] = useState("");
  const [infosUtiles, setInfosUtiles] = useState("");

  // Étape 3 — pré-remplie avec le préset métier (éditable).
  const [inclus, setInclus] = useState(PRESET_INCLUS);
  const [exclus, setExclus] = useState(PRESET_EXCLUS);

  // Étape 4
  const [workflow, setWorkflow] = useState<WorkflowDraft>({
    consignes_globales: "",
    sections: [],
  });

  const [submitting, setSubmitting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionMsg, setSuggestionMsg] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const step1Ok = firstName.trim().length > 0 && lastName.trim().length > 0;
  const step2Ok = entreprise.trim().length > 0 && activite.trim().length > 0;
  const step3Ok = parseMotsCles(inclus).length > 0;

  const finish = async () => {
    setSubmitting(true);
    setErreur(null);
    try {
      const profile = saveUserProfile({
        firstName,
        lastName,
        email,
        entreprise,
        activite,
        infosUtiles,
      });
      await api.ecrireFiltreVeille({
        inclus: parseMotsCles(inclus),
        exclus: parseMotsCles(exclus),
      });
      if (workflow.sections.length > 0) {
        await api.ecrireWorkflowHermion({
          consignes_globales: workflow.consignes_globales,
          sections: workflow.sections,
        });
      }
      // Filtres persistés : on déverrouille ARGOS et on déclenche la première
      // collecte avec les critères définitifs (issue #3). ARGOS n'a rien
      // collecté avant cet instant.
      await api.initialiserArgos();
      markOnboardingDone();
      onDone(profile);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const suggestFilters = async () => {
    setSuggesting(true);
    setErreur(null);
    setSuggestionMsg(null);
    try {
      const suggestion = await api.suggererFiltreVeille({
        entreprise,
        activite,
        infos: infosUtiles,
      });
      setInclus(suggestion.inclus.join(", "));
      setExclus(suggestion.exclus.join(", "));
      setSuggestionMsg(
        suggestion.raisonnement
          ? `${suggestion.inclus.length} include and ${suggestion.exclus.length} exclude keywords suggested. ${suggestion.raisonnement}`
          : `${suggestion.inclus.length} include and ${suggestion.exclus.length} exclude keywords suggested.`,
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <ModaleFond>
      <ModalePanneau style={{ width: "min(640px, 94vw)" }}>
        <div className="modal__head">
          <div className="modal__eyebrow">
            <HermesMark size={14} />
            <span>HERMES · First launch — step {step}/4</span>
          </div>
          <ProgressDots step={step} />
        </div>

        {step === 1 && (
          <StepIdentite
            firstName={firstName}
            lastName={lastName}
            email={email}
            onFirstName={setFirstName}
            onLastName={setLastName}
            onEmail={setEmail}
          />
        )}
        {step === 2 && (
          <StepEntreprise
            entreprise={entreprise}
            activite={activite}
            infosUtiles={infosUtiles}
            onEntreprise={setEntreprise}
            onActivite={setActivite}
            onInfos={setInfosUtiles}
          />
        )}
        {step === 3 && (
          <StepFiltres
            inclus={inclus}
            exclus={exclus}
            onInclus={setInclus}
            onExclus={setExclus}
            canSuggest={step2Ok}
            suggesting={suggesting}
            suggestionMsg={suggestionMsg}
            onSuggest={() => void suggestFilters()}
          />
        )}
        {step === 4 && (
          <StepWorkflow value={workflow} onChange={setWorkflow} />
        )}

        {erreur && (
          <div
            style={{
              margin: "12px 26px 0",
              padding: "10px 14px",
              background: "rgba(220,80,80,0.10)",
              border: "1px solid rgba(220,80,80,0.30)",
              borderRadius: 6,
              fontSize: 12.5,
              color: "var(--fg-2)",
            }}
          >
            Error: {erreur}
          </div>
        )}

        <div
          className="modal__foot"
          style={{ justifyContent: "space-between", alignItems: "center" }}
        >
          {step > 1 ? (
            <button
              className="btn btn--ghost"
              onClick={() => setStep((s) => (s - 1) as Step)}
              disabled={submitting}
            >
              ← Back
            </button>
          ) : (
            <span style={{ fontSize: 11.5, color: "var(--fg-4)" }}>
              All information stays local on this machine.
            </span>
          )}

          {step < 4 && (
            <button
              className="btn btn--gold"
              disabled={
                (step === 1 && !step1Ok) ||
                (step === 2 && !step2Ok) ||
                (step === 3 && !step3Ok)
              }
              onClick={() => setStep((s) => (s + 1) as Step)}
            >
              Continue →
            </button>
          )}
          {step === 4 && (
            <button
              className="btn btn--gold"
              disabled={submitting}
              onClick={finish}
            >
              {submitting ? "Saving…" : "Finish and open HERMES"}
            </button>
          )}
        </div>
      </ModalePanneau>
    </ModaleFond>
  );
}

// --------------------------------------------------------------------------- //
// Sous-composants
// --------------------------------------------------------------------------- //

function ProgressDots({ step }: { step: Step }) {
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: 3,
            borderRadius: 2,
            background: i <= step ? "var(--gold)" : "var(--line-strong)",
            transition: "background 0.2s",
          }}
        />
      ))}
    </div>
  );
}

function StepIdentite({
  firstName,
  lastName,
  email,
  onFirstName,
  onLastName,
  onEmail,
}: {
  firstName: string;
  lastName: string;
  email: string;
  onFirstName: (v: string) => void;
  onLastName: (v: string) => void;
  onEmail: (v: string) => void;
}) {
  return (
    <div className="profile-modal__body">
      <h3 className="modal__title" style={{ marginTop: 0 }}>
        Who are you?
      </h3>
      <p className="modal__sub" style={{ marginBottom: 18 }}>
        Identity shown in the interface and passed to HERMION to personalise
        the tone and signature of drafted responses.
      </p>

      <div className="settings-row">
        <div className="settings-row__label">First name *</div>
        <input
          className="input"
          value={firstName}
          onChange={(e) => onFirstName(e.target.value)}
          autoFocus
        />
      </div>
      <div className="settings-row">
        <div>
          <div className="settings-row__label">Last name *</div>
          <div className="settings-row__hint">First letter = avatar</div>
        </div>
        <input className="input" value={lastName} onChange={(e) => onLastName(e.target.value)} />
      </div>
      <div className="settings-row">
        <div>
          <div className="settings-row__label">Email</div>
          <div className="settings-row__hint">Optional — used in exports</div>
        </div>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => onEmail(e.target.value)}
        />
      </div>
    </div>
  );
}

function StepEntreprise({
  entreprise,
  activite,
  infosUtiles,
  onEntreprise,
  onActivite,
  onInfos,
}: {
  entreprise: string;
  activite: string;
  infosUtiles: string;
  onEntreprise: (v: string) => void;
  onActivite: (v: string) => void;
  onInfos: (v: string) => void;
}) {
  return (
    <div className="profile-modal__body">
      <h3 className="modal__title" style={{ marginTop: 0 }}>
        Your company
      </h3>
      <p className="modal__sub" style={{ marginBottom: 18 }}>
        The more you share here, the better KRINOS scores tenders and the more
        precise and relevant HERMION's drafts will be.
      </p>

      <div className="settings-row">
        <div className="settings-row__label">Company name *</div>
        <input
          className="input"
          value={entreprise}
          onChange={(e) => onEntreprise(e.target.value)}
          placeholder="e.g. ACME Consulting"
          autoFocus
        />
      </div>
      <div className="settings-row">
        <div>
          <div className="settings-row__label">Main business activity *</div>
          <div className="settings-row__hint">In a few words</div>
        </div>
        <input
          className="input"
          value={activite}
          onChange={(e) => onActivite(e.target.value)}
          placeholder="e.g. IT services firm specialised in Java / PostgreSQL — public-sector project management"
        />
      </div>
      <div className="settings-row" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="settings-row__label">Useful information for the AI</div>
          <div className="settings-row__hint">
            Client references, certifications, team size, specialities…
          </div>
        </div>
        <textarea
          className="response-comment-input"
          style={{ minHeight: 100 }}
          value={infosUtiles}
          onChange={(e) => onInfos(e.target.value)}
          placeholder={"e.g. 12 FTE, ISO 27001 certified, references: Naval Group (2024), CDC (2023), DGAMPA (2022). PASSI-qualified auditors. Average day rate €950."}
        />
      </div>
    </div>
  );
}

function StepFiltres({
  inclus,
  exclus,
  onInclus,
  onExclus,
  canSuggest,
  suggesting,
  suggestionMsg,
  onSuggest,
}: {
  inclus: string;
  exclus: string;
  onInclus: (v: string) => void;
  onExclus: (v: string) => void;
  canSuggest: boolean;
  suggesting: boolean;
  suggestionMsg: string | null;
  onSuggest: () => void;
}) {
  return (
    <div className="profile-modal__body">
      <h3 className="modal__title" style={{ marginTop: 0 }}>
        Initial watch criteria
      </h3>
      <p className="modal__sub" style={{ marginBottom: 18 }}>
        ARGOS will filter tenders with these keywords before storing them in
        MNEMOSYNE. You can change them at any time in
        <em> Settings → Filter criteria</em>.
      </p>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button
          className="btn"
          disabled={!canSuggest || suggesting}
          onClick={onSuggest}
          title="Ask PYTHIA for relevant keywords based on your profile"
        >
          <Icon.refresh size={11} />
          {suggesting ? "PYTHIA is thinking…" : "Suggest (AI)"}
        </button>
      </div>

      <div className="settings-row" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="settings-row__label">Include keywords *</div>
          <div className="settings-row__hint">
            At least one must appear in the title/subject/issuer
          </div>
        </div>
        <textarea
          className="response-comment-input"
          style={{ minHeight: 80 }}
          value={inclus}
          onChange={(e) => onInclus(e.target.value)}
          placeholder="e.g. 정보시스템 유지보수, 보안 컨설팅, system maintenance, cybersecurity"
          autoFocus
        />
      </div>
      <div className="settings-row" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="settings-row__label">Exclude keywords</div>
          <div className="settings-row__hint">
            Tenders containing these terms are discarded immediately
          </div>
        </div>
        <textarea
          className="response-comment-input"
          style={{ minHeight: 80 }}
          value={exclus}
          onChange={(e) => onExclus(e.target.value)}
          placeholder="e.g. 청소, 조경, cleaning, catering"
        />
      </div>

      <div
        style={{
          marginTop: 14,
          padding: "10px 14px",
          background: "rgba(200,169,81,0.08)",
          border: "1px solid rgba(200,169,81,0.30)",
          borderRadius: 6,
          fontSize: 12,
          color: "var(--fg-2)",
        }}
      >
        Why this step is required: without a filter, ARGOS would collect every
        KONEPS tender (about 3,000 a day). With a few precise business
        keywords, you only review the ones that matter to you. Keywords match
        the tender text, so write them in Korean for KONEPS and in English for
        the World Bank.
      </div>

      {suggestionMsg && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 14px",
            background: "rgba(29,158,117,0.10)",
            border: "1px solid rgba(29,158,117,0.30)",
            borderRadius: 6,
            fontSize: 12,
            color: "var(--fg-2)",
            lineHeight: 1.5,
          }}
        >
          {suggestionMsg}
        </div>
      )}
    </div>
  );
}

function StepWorkflow({
  value,
  onChange,
}: {
  value: WorkflowDraft;
  onChange: (v: WorkflowDraft) => void;
}) {
  return (
    <div className="profile-modal__body">
      <h3 className="modal__title" style={{ marginTop: 0 }}>
        HERMION drafting framework
      </h3>
      <p className="modal__sub" style={{ marginBottom: 18 }}>
        Teach MNEMOSYNE how you respond: describe your process or paste past
        responses, and the AI derives a reusable workflow you can correct.
        HERMION will use it for every draft.
      </p>

      <WorkflowEditor value={value} onChange={onChange} />

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
        Optional: you can finish without a workflow — HERMION will then build an
        outline for each tender. You can define or correct it at any time in
        <em>Settings → HERMION drafting</em>.
      </div>
    </div>
  );
}
