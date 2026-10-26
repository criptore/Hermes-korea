import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AgentChip } from "../components/AgentChip";
import { Icon } from "../components/Icon";
import { Score } from "../components/Score";
import { StatusPill } from "../components/StatusPill";
import {
  api,
  type ReponseAvecAO,
  type ReponseHermion,
  type StatutReponseHermion,
} from "../lib/api";
import { type ResponseStatus } from "../lib/data";
import { enregistrerPdf } from "../lib/desktop";
import { VARIANTES_BADGE, VARIANTES_CARTE, VARIANTES_PANNEAU } from "../lib/motion";
import type { ToastInput } from "../lib/toast";
import { loadUserProfile } from "../lib/userProfile";

type Props = { onToast: (t: ToastInput) => void; externalRefreshKey?: number };

const STATUS_FILTERS: { id: StatutReponseHermion | "all"; label: string }[] = [
  { id: "all",          label: "All" },
  { id: "en_attente",   label: "Pending" },
  { id: "a_modifier",   label: "Needs changes" },
  { id: "validee",      label: "Approved" },
  { id: "rejetee",      label: "Rejected" },
  { id: "exportee",     label: "Exported" },
];

/** Bandeau de validation humaine : la soumission au portail reste exclusivement humaine. */
const MESSAGES_VALIDATION: Record<StatutReponseHermion, { titre: string; detail: string }> = {
  en_generation: {
    titre: "Drafting in progress",
    detail: "HERMION is drafting. Nothing is approved or submitted: human review comes next.",
  },
  en_attente: {
    titre: "Human approval required",
    detail: "HERMION never submits. Review, then approve or request changes.",
  },
  a_modifier: {
    titre: "Changes requested",
    detail: "Correct the content, then approve: the decision stays human.",
  },
  validee: {
    titre: "Approved by a human",
    detail: "Submission to the portal stays manual: export the PDF and upload it yourself.",
  },
  rejetee: {
    titre: "Rejected by a human",
    detail: "This response will not be used.",
  },
  exportee: {
    titre: "PDF exported",
    detail: "You still need to upload it to the portal yourself.",
  },
};

/** Mapping du statut backend vers le code utilisé par StatusPill (data.ts). */
function toUiStatus(s: StatutReponseHermion): ResponseStatus {
  if (s === "en_generation" || s === "en_attente") return "en-attente";
  if (s === "a_modifier") return "a-modifier";
  if (s === "validee") return "validee";
  if (s === "rejetee") return "rejetee";
  return "exportee";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatDuree(ms: number | null): string {
  if (!ms || ms <= 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function Responses({ onToast, externalRefreshKey = 0 }: Props) {
  const [filter, setFilter] = useState<StatutReponseHermion | "all">("all");
  const [reponses, setReponses] = useState<ReponseAvecAO[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ReponseHermion | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Charge la liste
  useEffect(() => {
    let cancelled = false;
    setLoadingList(true);
    api
      .listerReponsesHermion()
      .then((data) => {
        if (cancelled) return;
        setReponses(data);
        if (data.length > 0 && selectedId === null) {
          setSelectedId(data[0].id);
        }
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, externalRefreshKey]);

  // Charge le détail de la réponse sélectionnée
  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    api
      .lireReponseHermion(selectedId)
      .then((r) => {
        if (!cancelled) setDetail(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const filtered = useMemo(
    () => (filter === "all" ? reponses : reponses.filter((r) => r.statut === filter)),
    [reponses, filter],
  );

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  const selectedSummary = reponses.find((r) => r.id === selectedId);

  const onStatusChange = async (
    next: StatutReponseHermion,
    commentaire?: string,
    toast?: ToastInput,
  ) => {
    if (selectedId === null) return;
    try {
      const updated = await api.modifierStatutReponse(selectedId, next, commentaire);
      setDetail(updated);
      // Synchronise la liste localement
      setReponses((rs) =>
        rs.map((r) => (r.id === selectedId ? { ...r, statut: updated.statut } : r)),
      );
      if (toast) onToast(toast);
    } catch (e) {
      onToast({
        title: "HERMION",
        app: "Error",
        msg: e instanceof Error ? e.message : String(e),
        agent: "hermion",
      });
    }
  };

  /** Enregistre le PDF : dialogue natif sous Tauri, téléchargement navigateur en mode web. */
  const telechargerPdf = async (id: number, version: number) => {
    const blob = await api.telechargerExportReponse(id);
    await enregistrerPdf(blob, `response_${id}_v${version}.pdf`);
  };

  const onDownload = async () => {
    if (!detail) return;
    try {
      await telechargerPdf(detail.id, detail.version);
    } catch (e) {
      onToast({
        title: "HERMION",
        app: "Download error",
        msg: e instanceof Error ? e.message : String(e),
        agent: "hermion",
      });
    }
  };

  const onExport = async () => {
    if (selectedId === null) return;
    try {
      const updated = await api.exporterReponse(selectedId);
      setDetail(updated);
      setReponses((rs) =>
        rs.map((r) => (r.id === selectedId ? { ...r, statut: updated.statut } : r)),
      );
      onToast({
        title: "HERMION",
        app: "Response exported",
        msg: `PDF generated for response v${updated.version}.`,
        agent: "hermion",
      });
      await telechargerPdf(updated.id, updated.version);
    } catch (e) {
      onToast({
        title: "HERMION",
        app: "Export error",
        msg: e instanceof Error ? e.message : String(e),
        agent: "hermion",
      });
    }
  };

  const onSaveContent = async (contenu: string, commentaire?: string): Promise<boolean> => {
    if (selectedId === null) return false;
    try {
      const updated = await api.modifierContenuReponse(selectedId, contenu, commentaire);
      setDetail(updated);
      setReponses((rs) =>
        rs.map((r) =>
          r.id === selectedId
            ? {
                ...r,
                statut: updated.statut,
                longueur_mots: updated.longueur_mots,
              }
            : r,
        ),
      );
      onToast({
        title: "HERMION",
        app: "Response updated",
        msg: "Content saved, status set to \"needs changes\".",
        agent: "hermion",
      });
      return true;
    } catch (e) {
      onToast({
        title: "HERMION",
        app: "Save error",
        msg: e instanceof Error ? e.message : String(e),
        agent: "hermion",
      });
      return false;
    }
  };

  return (
    <div className="view">
      <div className="filters">
        {STATUS_FILTERS.map((s) => {
          const count =
            s.id === "all" ? reponses.length : reponses.filter((r) => r.statut === s.id).length;
          const active = filter === s.id;
          return (
            <button
              key={s.id}
              className={`btn ${active ? "btn--gold" : "btn--ghost"} btn--sm`}
              onClick={() => setFilter(s.id)}
            >
              {s.label}
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10.5,
                  opacity: 0.65,
                  marginLeft: 4,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <button className="btn btn--ghost btn--sm" onClick={reload} disabled={loadingList}>
          <Icon.refresh size={11} /> {loadingList ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div
          style={{
            margin: "12px 0",
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

      <div className="responses-layout">
        <div className="responses-list">
          {loadingList && reponses.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: "var(--fg-3)", fontSize: 12.5 }}>
              Loading responses…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: "var(--fg-3)", fontSize: 12.5 }}>
              {reponses.length === 0
                ? "No HERMION responses drafted yet. Go to the Tenders tab, pick a tender to answer, then start drafting."
                : "No responses with this status."}
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
            {filtered.map((r, rang) => {
              const uiStatus = toUiStatus(r.statut);
              const isSel = r.id === selectedId;
              return (
                <motion.article
                  key={r.id}
                  layout="position"
                  variants={VARIANTES_CARTE}
                  custom={rang}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className={`response-card${isSel ? " response-card--selected" : ""}`}
                  onClick={() => setSelectedId(r.id)}
                >
                  <div className="response-card__top">
                    <span>resp-{r.id} · v{r.version}</span>
                    <StatusPill status={uiStatus} />
                  </div>
                  <h3 className="response-card__title">{r.appel_offre_titre}</h3>
                  <div className="response-card__bottom">
                    <span>{r.appel_offre_emetteur || "—"}</span>
                    <span>
                      {r.longueur_mots ? `${r.longueur_mots} words · ` : ""}
                      {formatDate(r.cree_le).split(" ")[1] || formatDate(r.cree_le)}
                    </span>
                  </div>
                </motion.article>
              );
            })}
            </AnimatePresence>
          )}
        </div>

        {selectedSummary && detail && (
          <ResponseDetail
            key={detail.id}
            summary={selectedSummary}
            detail={detail}
            loading={loadingDetail}
            onStatusChange={onStatusChange}
            onSaveContent={onSaveContent}
            onExport={onExport}
            onDownload={() => void onDownload()}
          />
        )}
        {!selectedSummary && !loadingList && reponses.length > 0 && (
          <div className="response-detail" style={{ padding: 30, color: "var(--fg-3)" }}>
            Select a response on the left.
          </div>
        )}
      </div>
    </div>
  );
}

type DetailProps = {
  summary: ReponseAvecAO;
  detail: ReponseHermion;
  loading: boolean;
  onStatusChange: (
    next: StatutReponseHermion,
    commentaire?: string,
    toast?: ToastInput,
  ) => void;
  onSaveContent: (contenu: string, commentaire?: string) => Promise<boolean>;
  onExport: () => void;
  onDownload: () => void;
};

function ResponseDetail({
  summary,
  detail,
  loading,
  onStatusChange,
  onSaveContent,
  onExport,
  onDownload,
}: DetailProps) {
  const [editing, setEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(detail.contenu);
  const [comment, setComment] = useState(detail.commentaire_humain ?? "");

  // Changement de réponse : on repart de zéro.
  useEffect(() => {
    setEditedContent(detail.contenu);
    setComment(detail.commentaire_humain ?? "");
    setEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.id]);

  // Même réponse rafraîchie (polling, sauvegarde) : ne pas écraser la saisie en cours.
  useEffect(() => {
    if (editing) return;
    setEditedContent(detail.contenu);
    setComment(detail.commentaire_humain ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.contenu, detail.commentaire_humain]);

  const uiStatus = toUiStatus(detail.statut);
  const verrouille = detail.statut === "exportee" || detail.statut === "rejetee";
  const peutValider = detail.statut === "en_attente" || detail.statut === "a_modifier";
  const showCommentBox = detail.statut === "a_modifier" || detail.statut === "rejetee" || editing;

  const profil = loadUserProfile();
  const profilLabel = profil
    ? `${profil.firstName} ${profil.lastName}`.trim()
    : "User not configured";

  return (
    // Changement de réponse/version (key=detail.id côté parent) : le détail glisse.
    <motion.div
      className="response-detail"
      variants={VARIANTES_PANNEAU}
      initial="initial"
      animate="animate"
    >
      <aside className="response-actions">
        <div
          style={{
            fontSize: 10.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--fg-4)",
            marginBottom: 8,
          }}
        >
          Response #{detail.id} · v{detail.version}
        </div>
        <h2
          style={{
            fontSize: 15,
            fontWeight: 600,
            lineHeight: 1.35,
            margin: "0 0 8px",
            letterSpacing: "-0.005em",
          }}
        >
          {summary.appel_offre_titre}
        </h2>
        <div style={{ fontSize: 12, color: "var(--fg-3)", marginBottom: 16 }}>
          {summary.appel_offre_emetteur || "Unknown issuer"}
        </div>

        <div style={{ marginBottom: 18 }}>
          <StatusPill status={uiStatus} />
        </div>

        {/* Validation humaine mise en avant : HERMION rédige, seul l'humain valide et soumet. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={detail.statut}
            className="validation-humaine"
            data-etat={detail.statut}
            role="status"
            variants={VARIANTES_BADGE}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{ transformOrigin: "left center" }}
          >
            <strong>{MESSAGES_VALIDATION[detail.statut].titre}</strong>
            {MESSAGES_VALIDATION[detail.statut].detail}
          </motion.div>
        </AnimatePresence>

        <dl className="kv" style={{ marginBottom: 22 }}>
          <dt>Version</dt>
          <dd style={{ fontFamily: "var(--font-mono)" }}>v{detail.version}</dd>
          <dt>Words</dt>
          <dd>{detail.longueur_mots ?? "—"}</dd>
          <dt>Generated</dt>
          <dd style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>
            {formatDate(detail.cree_le)}
          </dd>
          <dt>Duration</dt>
          <dd>{formatDuree(detail.duree_generation_ms)}</dd>
          <dt>Profile</dt>
          <dd style={{ fontSize: 11.5 }}>{profilLabel}</dd>
          <dt>Agent</dt>
          <dd>
            <AgentChip agent="hermion" state="active" compact />
          </dd>
          <dt>Tender score</dt>
          <dd>
            <Score value={70} />
          </dd>
        </dl>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            className="btn btn--ok"
            disabled={!peutValider || loading}
            onClick={() =>
              onStatusChange("validee", undefined, {
                title: "HERMION",
                app: "Response approved",
                msg: `Response v${detail.version} approved — the tender moves to "answered".`,
                agent: "hermion",
              })
            }
          >
            <Icon.check size={13} /> Approve
          </button>
          <button
            className="btn btn--warn"
            disabled={verrouille || loading}
            onClick={() =>
              onStatusChange("a_modifier", comment, {
                title: "HERMION",
                app: "Changes requested",
                msg: "The response is now marked \"needs changes\".",
                agent: "hermion",
              })
            }
          >
            <Icon.refresh size={13} /> Request changes
          </button>
          <button
            className="btn btn--danger"
            disabled={verrouille || loading}
            onClick={() =>
              onStatusChange("rejetee", comment, {
                title: "HERMION",
                app: "Response rejected",
                msg: `Response v${detail.version} rejected.`,
                agent: "hermion",
              })
            }
          >
            <Icon.close size={13} /> Reject
          </button>
          {detail.statut === "exportee" ? (
            <button
              className="btn btn--ok"
              onClick={onDownload}
            >
              <Icon.download size={13} /> Download PDF
            </button>
          ) : (
            <button
              className="btn btn--ok"
              disabled={detail.statut !== "validee" || loading}
              onClick={onExport}
              title={
                detail.statut !== "validee"
                  ? "The response must be approved first"
                  : "Generate and download the PDF"
              }
            >
              <Icon.download size={13} /> Export to PDF
            </button>
          )}
          <div className="divider" />
          <button
            className="btn"
            disabled={!editing}
            onClick={async () => {
              if (await onSaveContent(editedContent, comment)) setEditing(false);
            }}
          >
            <Icon.check size={13} /> Save changes
          </button>
          <button
            className={`btn ${editing ? "btn--ghost" : ""}`}
            onClick={() => {
              if (editing) {
                setEditedContent(detail.contenu);
                setEditing(false);
              } else {
                setEditing(true);
              }
            }}
            disabled={verrouille}
          >
            <Icon.refresh size={13} /> {editing ? "Cancel editing" : "Edit content"}
          </button>
        </div>

        {showCommentBox && (
          <div style={{ marginTop: 22 }}>
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--fg-3)",
                marginBottom: 8,
              }}
            >
              Reviewer comment
            </div>
            <textarea
              className="response-comment-input"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Internal notes, reasons for changes/rejection, points to fix…"
            />
          </div>
        )}
      </aside>

      <div className="response-pdf">
        <div className="pdf-toolbar">
          <span style={{ fontSize: 11 }}>
            Response resp-{detail.id} · <strong style={{ color: "var(--fg)" }}>v{detail.version}</strong>
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10.5 }}>
            {detail.longueur_mots ?? "—"} words ·{" "}
            {Math.max(1, Math.ceil((detail.longueur_mots ?? 0) / 350))} pp. approx.
          </span>
        </div>

        <div className="pdf-page" style={{ padding: editing ? 0 : undefined }}>
          {editing ? (
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              spellCheck
              style={{
                width: "100%",
                height: "100%",
                minHeight: 540,
                resize: "vertical",
                fontFamily: "var(--font-mono)",
                fontSize: 12.5,
                lineHeight: 1.6,
                padding: 20,
                border: "none",
                background: "transparent",
                color: "var(--fg)",
                outline: "none",
              }}
            />
          ) : (
            <ReponseMarkdown contenu={detail.contenu} />
          )}
        </div>
      </div>
    </motion.div>
  );
}

/** Rendu basique du markdown HERMION : titres, paragraphes, listes simples. */
function ReponseMarkdown({ contenu }: { contenu: string }) {
  const blocks = contenu.split(/\n{2,}/);
  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
      {blocks.map((b, i) => {
        const trimmed = b.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith("# ")) {
          return (
            <h1 key={i} style={{ fontSize: 22, fontWeight: 700, marginTop: 0, marginBottom: 14 }}>
              {trimmed.slice(2)}
            </h1>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h2 key={i} style={{ fontSize: 16, fontWeight: 600, marginTop: 18, marginBottom: 8 }}>
              {trimmed.slice(3)}
            </h2>
          );
        }
        if (trimmed.startsWith("### ")) {
          return (
            <h3 key={i} style={{ fontSize: 14, fontWeight: 600, marginTop: 14, marginBottom: 6 }}>
              {trimmed.slice(4)}
            </h3>
          );
        }
        // Liste numérotée ou à puces
        const lines = trimmed.split("\n");
        const isList = lines.every((l) => /^(\d+\.|-|\*)\s+/.test(l.trim()));
        if (isList) {
          const ordered = /^\d+\./.test(lines[0].trim());
          const Tag = ordered ? "ol" : "ul";
          return (
            <Tag key={i} style={{ margin: "8px 0 12px 22px" }}>
              {lines.map((l, j) => (
                <li key={j} style={{ marginBottom: 4 }}>
                  {l.trim().replace(/^(\d+\.|-|\*)\s+/, "")}
                </li>
              ))}
            </Tag>
          );
        }
        // Paragraphe italique (commence par *…* sur toute la ligne)
        if (/^\*[^*].+\*$/.test(trimmed)) {
          return (
            <p key={i} style={{ fontStyle: "italic", color: "var(--fg-3)", margin: "4px 0" }}>
              {trimmed.slice(1, -1)}
            </p>
          );
        }
        return (
          <p key={i} style={{ margin: "0 0 12px" }}>
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}
