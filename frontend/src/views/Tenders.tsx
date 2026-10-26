import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type AnalyseKrinos,
  type AppelOffre,
  type PonderationKrinos,
  type ProgressionHermion,
} from "../lib/api";
import { ConcurrenceDecp } from "../components/ConcurrenceDecp";
import { useApi } from "../lib/useApi";
import {
  COURBE,
  DUREE,
  VARIANTES_BADGE,
  VARIANTES_CARTE,
  VARIANTES_PANNEAU,
  delaiCascade,
} from "../lib/motion";
import { EVT_RECHERCHE, consommerDemandeRecherche } from "../lib/natif";
import { STATUTS_ACTIFS, deadlineInfo, type Tender, type TenderTag } from "../lib/data";
import { AgentChip } from "../components/AgentChip";
import { Deadline } from "../components/Deadline";
import { Icon } from "../components/Icon";
import { Score } from "../components/Score";
import { Tag } from "../components/Tag";
import type { ToastInput } from "../lib/toast";
import { loadUserProfile } from "../lib/userProfile";

type Props = {
  isLoading: boolean;
  refreshKey: number;
  onCountChange: (count: number) => void;
  onToast: (t: ToastInput) => void;
};

export function Tenders({ isLoading, refreshKey, onCountChange, onToast }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [portal, setPortal] = useState("all");
  const [tag, setTag] = useState("all");
  // Vue « Hors filtre » : AO écartés par les filtres métier ou non-appels TED
  // (masqués par défaut côté API), réintégrables via « Marquer à répondre ».
  const [horsFiltre, setHorsFiltre] = useState(false);
  const champRecherche = useRef<HTMLInputElement>(null);

  // Ctrl/Cmd+K : focus (et sélection) du champ de recherche, y compris quand le
  // raccourci a été pressé depuis une autre vue, avant le montage de celle-ci.
  useEffect(() => {
    const focaliser = () => {
      consommerDemandeRecherche();
      champRecherche.current?.focus();
      champRecherche.current?.select();
    };
    if (consommerDemandeRecherche()) focaliser();
    window.addEventListener(EVT_RECHERCHE, focaliser);
    return () => window.removeEventListener(EVT_RECHERCHE, focaliser);
  }, []);

  // Échap ferme le panneau de détail (sauf si un autre composant a déjà géré la touche).
  useEffect(() => {
    if (selectedId === null) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) setSelectedId(null);
    };
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, [selectedId]);
  const {
    data: page,
    error: apiError,
    loading: apiLoading,
    reload,
  } = useApi(
    (signal) => api.listerAO(horsFiltre ? "hors_filtre" : undefined, signal),
    [refreshKey, horsFiltre],
  );

  // Données précédentes conservées si une requête échoue (pas de liste vidée).
  const tenders = useMemo(() => (page ? page.items.map(mapAppelOffre) : []), [page]);

  useEffect(() => {
    // Le compteur global ne compte que la veille active, pas les hors filtre.
    if (page && !horsFiltre) onCountChange(page.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    tenders.forEach((t) => t.tags.forEach((tg) => set.add(tg.label)));
    return ["all", ...Array.from(set)];
  }, [tenders]);

  const allPortals = useMemo(() => {
    const set = new Set(tenders.map((t) => t.portal));
    return ["all", ...Array.from(set)];
  }, [tenders]);

  const filtered = tenders.filter((t) => {
    if (
      search &&
      !t.title.toLowerCase().includes(search.toLowerCase()) &&
      !t.issuer.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    if (t.score < minScore) return false;
    if (portal !== "all" && t.portal !== portal) return false;
    if (tag !== "all" && !t.tags.some((tg) => tg.label === tag)) return false;
    return true;
  });

  const urgentCount = filtered.filter(
    (t) => STATUTS_ACTIFS.includes(t.statutApi ?? "") && deadlineInfo(t.deadline).urgent,
  ).length;
  const selected = filtered.find((t) => t.id === selectedId);
  const loading = isLoading || apiLoading;

  return (
    <div className="view">
      {loading && (
        <div className="loading-banner">
          <span className="loading-banner__icon" />
          <span>
            <strong style={{ color: "var(--argos)", letterSpacing: "0.08em" }}>ARGOS</strong>{" "}
            is collecting new tenders…
          </span>
          <div className="loading-banner__bar" />
          <span style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
            ARGOS scrapers
          </span>
        </div>
      )}

      <div className="filters">
        <div className="filter-input">
          <Icon.search />
          <input
            ref={champRecherche}
            type="text"
            placeholder="Search tenders, issuers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="filter-select"
          value={portal}
          onChange={(e) => setPortal(e.target.value)}
        >
          {allPortals.map((p) => (
            <option key={p} value={p}>
              {p === "all" ? "All portals" : p}
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        >
          {allTags.map((t) => (
            <option key={t} value={t}>
              {t === "all" ? "All tags" : t}
            </option>
          ))}
        </select>
        <div className="filter-slider">
          <span>Min. score</span>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={minScore}
            onChange={(e) => setMinScore(+e.target.value)}
          />
          <strong>{minScore}</strong>
        </div>
        <button
          className={`btn btn--sm${horsFiltre ? "" : " btn--ghost"}`}
          aria-pressed={horsFiltre}
          title="Show tenders discarded by the filters or that are not calls for competition"
          onClick={() => {
            setSelectedId(null);
            setHorsFiltre((v) => !v);
          }}
        >
          Filtered out
        </button>
        <div style={{ flex: 1 }} />
        <button className="btn btn--ghost btn--sm" onClick={() => void reload()}>
          <Icon.refresh size={11} /> Refresh
        </button>
      </div>

      <div className={`tender-layout${selected ? "" : " tender-layout--no-panel"}`}>
        <div className="tender-list">
          <div className="tender-list__count">
            <strong>{filtered.length}</strong> tender{filtered.length > 1 ? "s" : ""} —{" "}
            {urgentCount} urgent
          </div>

          {apiError && (
            <div className="loading-banner loading-banner--error">
              <Icon.warning size={13} />
              <span>
                Backend unavailable: {apiError}. Check that HERMES has started the
                local API.
              </span>
            </div>
          )}

          {loading &&
            [0, 1, 2].map((i) => (
              <div className="skeleton-card" key={"sk" + i}>
                <span className="skel" style={{ width: "30%" }} />
                <span
                  className="skel"
                  style={{ width: "70%", height: 14, marginTop: 10 }}
                />
                <span className="skel" style={{ width: "40%", marginTop: 10 }} />
              </div>
            ))}

          <AnimatePresence mode="popLayout">
          {filtered.map((t, rang) => {
            const isSel = t.id === selectedId;
            return (
              <motion.article
                key={t.id}
                layout="position"
                variants={VARIANTES_CARTE}
                custom={rang}
                initial="initial"
                animate="animate"
                exit="exit"
                className={`tender-card${isSel ? " tender-card--selected" : ""}`}
                onClick={() => setSelectedId(isSel ? null : t.id)}
              >
                <div>
                  <div className="tender-card__top">
                    <span className="tender-card__issuer">{t.issuer}</span>
                    <span>·</span>
                    <span className="tender-card__portal">{t.portal}</span>
                    <span>·</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }}>
                      {t.reference}
                    </span>
                  </div>
                  <h3 className="tender-card__title">{t.title}</h3>
                  <div
                    className="tender-card__tags"
                    style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
                  >
                    {t.tags.map((tg) => (
                      <Tag key={tg.label} label={tg.label} tone={tg.tone} />
                    ))}
                    <DocumentsBadge tender={t} />
                    <HorsProfilBadge tender={t} />
                  </div>
                </div>
                <div className="tender-card__right">
                  {t.analyzed ? <Score value={t.score} /> : <NonAnalyse />}
                  <Deadline date={t.deadline} />
                </div>
              </motion.article>
            );
          })}
          </AnimatePresence>

          {!loading && filtered.length === 0 && (
            <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--fg-3)" }}>
              <p>
                {apiError
                  ? "No tenders loaded from MNEMOSYNE."
                  : "No tenders match the filters."}
              </p>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setSearch("");
                  setMinScore(0);
                  setPortal("all");
                  setTag("all");
                }}
              >
                Reset filters
              </button>
            </div>
          )}
        </div>

        <AnimatePresence mode="popLayout" initial={false}>
          {selected && (
            <motion.div
              key={selected.id}
              className="tender-panel-wrap"
              variants={VARIANTES_PANNEAU}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <TenderPanel
                tender={selected}
                onClose={() => setSelectedId(null)}
                onChanged={() => {
                  setSelectedId(null);
                  void reload();
                }}
                onToast={onToast}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function mapAppelOffre(ao: AppelOffre): Tender {
  const tags: TenderTag[] = [];
  if (ao.type_marche) tags.push({ label: ao.type_marche, tone: "gold" });
  if (ao.zone_geographique) tags.push({ label: ao.zone_geographique, tone: "green" });
  if (ao.code_naf) tags.push({ label: ao.code_naf, tone: "violet" });
  if (tags.length === 0) tags.push({ label: statutLabel(ao.statut), tone: "coral" });

  return {
    id: String(ao.id),
    title: ao.titre,
    issuer: ao.emetteur ?? "Issuer not specified",
    portal:
      ao.portail_nom?.toUpperCase() ??
      (ao.portail_id ? `Portal #${ao.portail_id}` : "Direct source"),
    deadline: ao.date_limite,
    budget: formatBudget(ao.budget_estime, ao.devise),
    reference: ao.reference_externe ?? `AO-${ao.id}`,
    score: ao.score ?? 0,
    analyzed: ao.analyse_disponible,
    tags,
    summary:
      ao.objet ??
      "Tender collected by ARGOS. KRINOS has not produced a detailed summary yet.",
    keypoints: [
      `MNEMOSYNE status: ${statutLabel(ao.statut)}`,
      ao.date_publication ? `Published: ${formatDate(ao.date_publication)}` : "Publication date not specified",
      ao.url_source ? `Source: ${ao.url_source}` : "Source URL not specified",
      `Documents: ${ao.documents_telecharges}/${ao.documents_detectes} downloaded`,
    ],
    status: statutLabel(ao.statut),
    statutApi: ao.statut,
    documentsDetectes: ao.documents_detectes,
    documentsTelecharges: ao.documents_telecharges,
    horsProfilLaya: ao.hors_profil_laya === true,
  };
}

/** Badge « hors profil (Laya) » : AO non analysé par PYTHIA, analyse forçable. */
function HorsProfilBadge({ tender }: { tender: Tender }) {
  if (!tender.horsProfilLaya) return null;
  return (
    <motion.span
      variants={VARIANTES_BADGE}
      initial="initial"
      animate="animate"
      style={{
        fontSize: 10.5,
        fontFamily: "var(--font-mono)",
        color: "var(--fg-3)",
        border: "1px dashed var(--line)",
        borderRadius: 4,
        padding: "2px 6px",
        whiteSpace: "nowrap",
      }}
      title="Laya judges this tender outside your profile: PYTHIA has not analysed it. Open it to force the analysis."
    >
      Off-profile (Laya)
    </motion.span>
  );
}

/** Badge synthétique de l'état documents d'un AO (détectés / téléchargés). */
function DocumentsBadge({ tender }: { tender: Tender }) {
  const detectes = tender.documentsDetectes ?? 0;
  const telecharges = tender.documentsTelecharges ?? 0;
  if (detectes === 0) return null;
  const complet = telecharges >= detectes;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10.5,
        fontFamily: "var(--font-mono)",
        color: complet ? "var(--argos)" : "var(--fg-3)",
        border: `1px solid ${complet ? "rgba(29,158,117,0.35)" : "var(--line)"}`,
        borderRadius: 4,
        padding: "2px 6px",
        whiteSpace: "nowrap",
      }}
      title={
        complet
          ? "All detected documents are downloaded locally"
          : "Some detected documents are not downloaded yet"
      }
    >
      <Icon.document size={11} />
      {telecharges}/{detectes}
    </span>
  );
}

function formatBudget(value: number | null, devise: string): string {
  if (value === null) return "Budget not specified";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: devise || "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statutLabel(statut: string): string {
  const labels: Record<string, string> = {
    brut: "Raw",
    analyse: "Analysed",
    a_repondre: "To answer",
    en_redaction: "Drafting",
    repondu: "Answered",
    rejete: "Rejected",
    expire: "Expired",
    hors_filtre: "Filtered out",
  };
  return labels[statut] ?? statut;
}

/** Pastille « non analysé » — distingue l'absence de score d'un score réel de 0. */
function NonAnalyse() {
  return (
    <span
      style={{
        fontSize: 11,
        color: "var(--fg-3)",
        border: "1px solid var(--line)",
        borderRadius: 6,
        padding: "3px 8px",
        whiteSpace: "nowrap",
      }}
      title="KRINOS has not analysed this tender yet"
    >
      Not analysed
    </span>
  );
}

type PanelProps = {
  tender: Tender;
  onClose: () => void;
  onChanged: () => void;
  onToast: (t: ToastInput) => void;
};

function TenderPanel({ tender, onClose, onChanged, onToast }: PanelProps) {
  const { formatted, urgent, days, echu } = deadlineInfo(tender.deadline);
  const [redigerEnCours, setRedigerEnCours] = useState(false);
  const [progression, setProgression] = useState<ProgressionHermion | null>(null);
  const [analyse, setAnalyse] = useState<AnalyseKrinos | null>(null);
  const [ponderation, setPonderation] = useState<PonderationKrinos | null>(null);
  const [analyseLoading, setAnalyseLoading] = useState(true);
  const [recalculEnCours, setRecalculEnCours] = useState(false);
  const [relanceEnCours, setRelanceEnCours] = useState(false);
  const [dceEnCours, setDceEnCours] = useState(false);
  const aAnalyse = analyse !== null || tender.analyzed === true;
  const aDimensions = !!analyse && Object.keys(analyse.scores_dimensions).length > 0;
  const scoreAffiche = analyse?.score ?? tender.score;

  useEffect(() => {
    let cancelled = false;
    setAnalyseLoading(true);
    Promise.all([
      api.lireAnalyseKrinos(Number(tender.id)).catch(() => null),
      api.lirePonderation().catch(() => null),
    ])
      .then(([analyseData, ponderationData]) => {
        if (cancelled) return;
        setAnalyse(analyseData);
        setPonderation(ponderationData);
      })
      .finally(() => {
        if (!cancelled) setAnalyseLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tender.id]);

  const rediger = async () => {
    setRedigerEnCours(true);
    setProgression(null);
    onToast({
      title: "HERMION",
      app: "Drafting started",
      msg: "PYTHIA is preparing the response — allow 30 to 90 s depending on the size of the tender file.",
      agent: "hermion",
    });
    const aoId = Number(tender.id);
    // Polling de l'avancement pendant la génération (issue #7).
    const poll = window.setInterval(() => {
      api
        .progressionHermion(aoId)
        .then((p) => {
          if (p.connue) setProgression(p);
        })
        .catch(() => {
          /* transitoire : on retentera au prochain tick */
        });
    }, 1200);
    try {
      const profile = loadUserProfile();
      const result = await api.rediger(aoId, {
        profil: profile
          ? {
              prenom: profile.firstName,
              nom: profile.lastName,
              email: profile.email,
              entreprise: profile.entreprise,
              activite: [profile.activite, profile.infosUtiles].filter(Boolean).join("\n"),
            }
          : undefined,
      });
      onChanged();
      onToast({
        title: "HERMION",
        app: `Response v${result.reponse.version} drafted`,
        msg: `${result.reponse.longueur_mots ?? "?"} words — available in the "Responses" tab.`,
        agent: "hermion",
      });
    } catch (error) {
      onToast({
        title: "HERMION",
        app: "Drafting failed",
        msg: error instanceof Error ? error.message : "Unknown error.",
        agent: "hermion",
      });
    } finally {
      window.clearInterval(poll);
      setRedigerEnCours(false);
      setProgression(null);
    }
  };

  const updateStatus = async (status: "a_repondre" | "rejete") => {
    try {
      await api.modifierStatutAO(Number(tender.id), status);
      onToast({
        title: status === "a_repondre" ? "HERMION" : "ARGOS",
        app: status === "a_repondre" ? "Tender marked to answer" : "Tender excluded",
        msg:
          status === "a_repondre"
            ? "Status saved in MNEMOSYNE. HERMION can now prepare a draft."
            : "Rejected status saved in MNEMOSYNE.",
        agent: status === "a_repondre" ? "hermion" : "argos",
      });
      onChanged();
    } catch (error) {
      onToast({
        title: "HERMES",
        app: "Action failed",
        msg: error instanceof Error ? error.message : "Unknown error during the update.",
        agent: "krinos",
      });
    }
  };

  const recalculerScore = async () => {
    setRecalculEnCours(true);
    try {
      const next = await api.recalculerScoreKrinos(Number(tender.id));
      setAnalyse(next);
      onToast({
        title: "KRINOS",
        app: "Score recalculated",
        msg: `New weighted score: ${Math.round(next.score)}/100.`,
        agent: "krinos",
      });
    } catch (error) {
      onToast({
        title: "KRINOS",
        app: "Recalculation failed",
        msg: error instanceof Error ? error.message : "Unknown error during recalculation.",
        agent: "krinos",
      });
    } finally {
      setRecalculEnCours(false);
    }
  };

  // Relance une analyse KRINOS complète (PYTHIA) : produit résumé, ventilation
  // par dimension et score. À utiliser quand aucune analyse n'existe encore.
  const relancerAnalyse = async () => {
    setRelanceEnCours(true);
    onToast({
      title: "KRINOS",
      app: "Analysis started",
      msg: "PYTHIA is analysing the tender — summary, breakdown and score coming up.",
      agent: "krinos",
    });
    try {
      const { analyse: next } = await api.analyserKrinos(Number(tender.id), true);
      setAnalyse(next);
      onToast({
        title: "KRINOS",
        app: "Analysis complete",
        msg: `Score: ${Math.round(next.score)}/100.`,
        agent: "krinos",
      });
    } catch (error) {
      onToast({
        title: "KRINOS",
        app: "Analysis failed",
        msg: error instanceof Error ? error.message : "Is PYTHIA running?",
        agent: "krinos",
      });
    } finally {
      setRelanceEnCours(false);
    }
  };

  // Télécharge en local les documents publics détectés (TED HTML/PDF/XML,
  // sinon url_source). Best-effort côté backend ; on remonte le bilan.
  const telechargerDce = async () => {
    setDceEnCours(true);
    onToast({
      title: "KRINOS",
      app: "Downloading documents",
      msg: "Fetching the detected public notices/documents…",
      agent: "krinos",
    });
    try {
      const res = await api.telechargerDocumentsAO(Number(tender.id));
      onToast({
        title: "KRINOS",
        app: "Documents downloaded",
        msg:
          res.documents.length === 0
            ? "No usable public document for this tender."
            : `${res.documents.length} document(s) stored locally (${res.nouveaux} new).`,
        agent: "krinos",
      });
      onChanged();
    } catch (error) {
      onToast({
        title: "KRINOS",
        app: "Download failed",
        msg: error instanceof Error ? error.message : "Unknown error.",
        agent: "krinos",
      });
    } finally {
      setDceEnCours(false);
    }
  };

  return (
    <aside className="tender-panel">
      <div className="tender-panel__head">
        <button className="tender-panel__close" onClick={onClose} title="Close">
          <Icon.close />
        </button>
        <div className="tender-panel__eyebrow">
          <span style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}>
            {tender.reference}
          </span>
          <span style={{ color: "var(--fg-4)", margin: "0 8px" }}>·</span>
          {tender.portal}
        </div>
        <h2 className="tender-panel__title">{tender.title}</h2>
        <div className="tender-panel__meta">
          {aAnalyse ? <Score value={Math.round(scoreAffiche)} /> : <NonAnalyse />}
          <span style={{ color: "var(--fg-4)" }}>·</span>
          <Deadline date={tender.deadline} />
          <span style={{ color: "var(--fg-4)" }}>·</span>
          <span>{tender.issuer}</span>
        </div>
      </div>

      <div className="tender-panel__body">
        <div className="tender-panel__section">
          <div className="tender-panel__section-title">
            <AgentChip agent="krinos" state="active" compact /> Analysis summary
          </div>
          {analyse?.degradee && (
            <p className="tender-panel__summary" role="alert">
              <strong>Degraded analysis</strong>: PYTHIA did not return a usable answer; this
              summary and score are a local estimate to confirm (re-run the analysis).
            </p>
          )}
          {analyse?.a_verifier && (
            <motion.p
              className="tender-panel__summary"
              role="alert"
              variants={VARIANTES_BADGE}
              initial="initial"
              animate="animate"
              style={{ transformOrigin: "left center" }}
            >
              <strong>Needs review</strong>:{" "}
              {analyse.suspect_injection
                ? "this tender's text contains suspicious instructions aimed at influencing the automatic evaluation. "
                : "the analysis results are inconsistent or diverging. "}
              No automatic drafting — human decision required
              {analyse.drapeaux && analyse.drapeaux.length > 0
                ? ` (${analyse.drapeaux.join(", ")})`
                : ""}
              .
            </motion.p>
          )}
          <p className="tender-panel__summary">{analyse?.resume ?? tender.summary}</p>
          {analyse?.score_laya != null && (
            <p className="tender-panel__summary">
              <strong>Laya opinion</strong> (optional local judge): score{" "}
              {Math.round(analyse.score_laya)} / 100
              {analyse.confiance_laya != null
                ? `, confidence ${Math.round(analyse.confiance_laya * 100)} %`
                : ""}
              {analyse.details_laya?.pertinence != null
                ? `, relevance ${Math.round(analyse.details_laya.pertinence * 100)} %`
                : ""}
              . PYTHIA score (local): {Math.round(analyse.score)} / 100.
              {analyse.composite != null
                ? ` Composite go/no-go: ${Math.round(analyse.composite)} / 100 (${
                    analyse.verdict_composite === "go"
                      ? "go"
                      : analyse.verdict_composite === "no_go"
                        ? "no-go"
                        : "to be checked by a human"
                  }, indicative).`
                : ""}
            </p>
          )}
        </div>

        <div className="tender-panel__section">
          <div className="tender-panel__section-title">Key information</div>
          <dl className="kv">
            <dt>Issuer</dt>
            <dd>{tender.issuer}</dd>
            <dt>Reference</dt>
            <dd style={{ fontFamily: "var(--font-mono)" }}>{tender.reference}</dd>
            <dt>Budget</dt>
            <dd>{tender.budget}</dd>
            <dt>Portal</dt>
            <dd>{tender.portal}</dd>
            <dt>Deadline</dt>
            <dd>
              {formatted}
              {urgent && (
                <span style={{ color: "var(--hermion)", marginLeft: 8 }}>D−{days}</span>
              )}
              {echu && <span style={{ color: "var(--fg-4)", marginLeft: 8 }}>Expired</span>}
            </dd>
          </dl>
        </div>

        <ConcurrenceDecp aoId={Number(tender.id)} />

        <div className="tender-panel__section">
          <div className="tender-panel__section-title">Points of attention</div>
          <ul className="keypoints">
            {tender.keypoints.map((k, i) => (
              <li key={i}>{k}</li>
            ))}
          </ul>
        </div>

        <div className="tender-panel__section">
          <div className="tender-panel__section-title">Score weighting</div>
          <ScoreBreakdown
            loading={analyseLoading}
            scores={analyse?.scores_dimensions ?? null}
            ponderation={ponderation}
          />
        </div>
      </div>

      {redigerEnCours && (
        <div
          style={{
            margin: "0 20px 8px",
            padding: "10px 14px",
            background: "rgba(216,90,48,0.10)",
            border: "1px solid rgba(216,90,48,0.30)",
            borderRadius: 6,
            fontSize: 12,
            color: "var(--fg-2)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span className="loading-banner__icon" />
          <span style={{ flex: 1 }}>
            <strong style={{ color: "var(--hermion)", letterSpacing: "0.04em" }}>
              HERMION
            </strong>{" "}
            {progression
              ? progression.libelle +
                (progression.etape === "redaction" && progression.total
                  ? ` — section ${progression.index}/${progression.total}`
                  : "") +
                (progression.message ? ` · ${progression.message}` : "")
              : "Starting…"}
          </span>
          {progression && (
            <span
              style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}
            >
              {Math.round(progression.secondes_ecoulees)}s
            </span>
          )}
        </div>
      )}

      <div className="tender-panel__actions">
        <button
          className="btn btn--gold"
          onClick={() => void updateStatus("a_repondre")}
        >
          <Icon.check size={13} /> Mark to answer
        </button>
        <button
          className="btn btn--ghost"
          onClick={() => void updateStatus("rejete")}
        >
          <Icon.close size={13} /> Exclude
        </button>
        <button
          className="btn"
          onClick={() => void rediger()}
          disabled={redigerEnCours}
          title="Run HERMION to draft a response to this tender (requires the “to answer” status)"
        >
          <Icon.refresh size={13} />
          {redigerEnCours ? "Drafting…" : "Draft a response"}
        </button>
        {aDimensions ? (
          <button
            className="btn"
            onClick={() => void recalculerScore()}
            disabled={recalculEnCours}
            title="Recalculate the score with the current KRINOS weighting, without re-running PYTHIA"
          >
            <Icon.refresh size={13} />
            {recalculEnCours ? "Recalculating…" : "Recalculate score"}
          </button>
        ) : (
          <button
            className="btn"
            onClick={() => void relancerAnalyse()}
            disabled={relanceEnCours || analyseLoading}
            title="Run a full KRINOS analysis (PYTHIA): summary, breakdown and score"
          >
            <Icon.refresh size={13} />
            {relanceEnCours
              ? "Analysing…"
              : tender.horsProfilLaya
                ? "Force analysis"
                : "Run analysis"}
          </button>
        )}
        <button
          className="btn"
          onClick={() => void telechargerDce()}
          disabled={dceEnCours}
          title="Download the detected public documents/notices locally (best effort)"
        >
          <Icon.download size={13} />
          {dceEnCours ? "Downloading…" : "Download tender file"}
        </button>
      </div>
    </aside>
  );
}

type DimensionScore = keyof Omit<PonderationKrinos, "total">;

const SCORE_DIMENSIONS: { id: DimensionScore; label: string }[] = [
  { id: "affinite_metier", label: "Business fit" },
  { id: "references", label: "References" },
  { id: "adequation_budget", label: "Budget fit" },
  { id: "capacite_equipe", label: "Team capacity" },
  { id: "calendrier", label: "Schedule risk" },
];

function ScoreBreakdown({
  loading,
  scores,
  ponderation,
}: {
  loading: boolean;
  scores: AnalyseKrinos["scores_dimensions"] | null;
  ponderation: PonderationKrinos | null;
}) {
  if (loading) {
    return <div style={{ color: "var(--fg-3)", fontSize: 12 }}>Loading KRINOS…</div>;
  }
  if (!scores || Object.keys(scores).length === 0) {
    return (
      <div style={{ color: "var(--fg-3)", fontSize: 12, lineHeight: 1.5 }}>
        No breakdown available. Use the "Run analysis" button below so KRINOS
        produces the per-dimension scores.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {SCORE_DIMENSIONS.map((d) => {
        const value = scores[d.id];
        const weight = ponderation ? ponderation[d.id] : null;
        const ratio = (value ?? 0) / 100;
        const color =
          ratio > 0.7 ? "var(--argos)" : ratio > 0.4 ? "var(--warn)" : "var(--err)";
        const rang = SCORE_DIMENSIONS.indexOf(d);
        return (
          <div
            key={d.label}
            style={{
              display: "grid",
              gridTemplateColumns: "140px 1fr 64px",
              alignItems: "center",
              gap: 12,
              fontSize: 12,
            }}
          >
            <span style={{ color: "var(--fg-3)" }}>{d.label}</span>
            <div
              style={{
                height: 6,
                background: "var(--bg-2)",
                borderRadius: 3,
                overflow: "hidden",
                border: "1px solid var(--line)",
              }}
            >
              {/* Jauge : se remplit en scaleX depuis la gauche */}
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: ratio }}
                transition={{
                  duration: DUREE.lente,
                  delay: delaiCascade(rang),
                  ease: [...COURBE.sortie],
                }}
                style={{
                  width: "100%",
                  height: "100%",
                  background: color,
                  transformOrigin: "left center",
                }}
              />
            </div>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                textAlign: "right",
                color: "var(--fg-2)",
              }}
            >
              {value === undefined ? "—" : `${Math.round(value)}`}
              {weight !== null ? ` · ${weight}%` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}
