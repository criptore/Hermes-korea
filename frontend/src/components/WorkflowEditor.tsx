import { useState } from "react";
import { Icon } from "./Icon";
import { api, type SectionWorkflow } from "../lib/api";

export type WorkflowDraft = {
  consignes_globales: string;
  sections: SectionWorkflow[];
};

type Props = {
  value: WorkflowDraft;
  onChange: (v: WorkflowDraft) => void;
};

type DeriveMode = "workflow" | "exemples";

/**
 * Éditeur de workflow de rédaction HERMION, réutilisé à l'onboarding
 * (étape 4) et dans Paramètres → Rédaction HERMION.
 *
 * Deux entrées possibles :
 *   - décrire son processus en texte libre ("workflow")
 *   - coller une ou plusieurs réponses passées ("exemples")
 * PYTHIA en dérive une trame de sections, que l'utilisateur corrige
 * manuellement avant enregistrement (le PUT est géré par le parent).
 */
export function WorkflowEditor({ value, onChange }: Props) {
  const [mode, setMode] = useState<DeriveMode>("exemples");
  const [contenu, setContenu] = useState("");
  const [deriving, setDeriving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const { sections, consignes_globales } = value;

  const patchSection = (idx: number, patch: Partial<SectionWorkflow>) => {
    onChange({
      ...value,
      sections: sections.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    });
  };

  const removeSection = (idx: number) => {
    onChange({ ...value, sections: sections.filter((_, i) => i !== idx) });
  };

  const addSection = () => {
    onChange({
      ...value,
      sections: [...sections, { titre: "", brief: "", longueur_cible: null }],
    });
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange({ ...value, sections: next });
  };

  const derive = async () => {
    if (contenu.trim().length === 0) {
      setError("Describe your process or paste a past response first.");
      return;
    }
    setDeriving(true);
    setError(null);
    setInfo(null);
    try {
      const wf = await api.deriverWorkflowHermion({ mode, contenu });
      onChange({
        consignes_globales: wf.consignes_globales,
        sections: wf.sections,
      });
      setInfo(
        `${wf.sections.length} sections suggested by PYTHIA — review and correct them before saving.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeriving(false);
    }
  };

  return (
    <div>
      <div className="settings-row" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="settings-row__label">Starting point</div>
          <div className="settings-row__hint">
            PYTHIA derives a reusable outline from it
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className={`btn btn--sm${mode === "exemples" ? " btn--gold" : ""}`}
              onClick={() => setMode("exemples")}
              type="button"
            >
              Past responses
            </button>
            <button
              className={`btn btn--sm${mode === "workflow" ? " btn--gold" : ""}`}
              onClick={() => setMode("workflow")}
              type="button"
            >
              Describe my process
            </button>
          </div>
          <textarea
            className="response-comment-input"
            style={{ minHeight: 96 }}
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
            placeholder={
              mode === "exemples"
                ? "Paste one or more tender responses you have already written (full text)."
                : "Describe how you structure your responses: sections, order, tone, mandatory statements…"
            }
          />
          <div>
            <button
              className="btn"
              onClick={() => void derive()}
              disabled={deriving}
              type="button"
              title="Ask PYTHIA to derive a workflow"
            >
              <Icon.refresh size={11} />
              {deriving ? "PYTHIA is thinking…" : "Generate workflow (AI)"}
            </button>
          </div>
        </div>
      </div>

      {info && (
        <div
          style={{
            margin: "4px 0 0",
            padding: "10px 14px",
            background: "rgba(29,158,117,0.10)",
            border: "1px solid rgba(29,158,117,0.30)",
            borderRadius: 6,
            fontSize: 12.5,
            color: "var(--fg-2)",
          }}
        >
          {info}
        </div>
      )}
      {error && (
        <div
          style={{
            margin: "4px 0 0",
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
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div className="settings-row__label">
          Workflow sections ({sections.length})
        </div>
        <button className="btn btn--sm" onClick={addSection} type="button">
          <Icon.plus size={12} /> Add
        </button>
      </div>

      {sections.length === 0 && (
        <div style={{ color: "var(--fg-3)", fontSize: 13, padding: "12px 0" }}>
          No sections. Generate them with AI or add them by hand — otherwise
          HERMION will build a dynamic outline for each tender.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
        {sections.map((s, i) => (
          <div
            key={i}
            style={{
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: "12px 14px",
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--fg-4)",
                  width: 18,
                }}
              >
                {i + 1}
              </span>
              <input
                className="input"
                style={{ flex: 1 }}
                value={s.titre}
                onChange={(e) => patchSection(i, { titre: e.target.value })}
                placeholder="Section title"
              />
              <button
                className="btn btn--sm"
                onClick={() => moveSection(i, -1)}
                disabled={i === 0}
                type="button"
                title="Move up"
                style={{ padding: "4px 7px" }}
              >
                <span style={{ display: "inline-block", transform: "rotate(-90deg)" }}>
                  <Icon.chevron size={11} />
                </span>
              </button>
              <button
                className="btn btn--sm"
                onClick={() => moveSection(i, 1)}
                disabled={i === sections.length - 1}
                type="button"
                title="Move down"
                style={{ padding: "4px 7px" }}
              >
                <span style={{ display: "inline-block", transform: "rotate(90deg)" }}>
                  <Icon.chevron size={11} />
                </span>
              </button>
              <button
                className="btn btn--sm"
                onClick={() => removeSection(i)}
                type="button"
                title="Delete section"
                style={{ padding: "4px 7px" }}
              >
                <Icon.close size={11} />
              </button>
            </div>
            <textarea
              className="response-comment-input"
              style={{ minHeight: 56, marginTop: 8 }}
              value={s.brief}
              onChange={(e) => patchSection(i, { brief: e.target.value })}
              placeholder="What the section must contain (1-3 sentences)"
            />
            <div
              style={{
                marginTop: 8,
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: "var(--fg-3)",
              }}
            >
              <span>Target length (words, optional)</span>
              <input
                className="input"
                style={{ width: 90 }}
                type="number"
                min={0}
                value={s.longueur_cible ?? ""}
                onChange={(e) =>
                  patchSection(i, {
                    longueur_cible:
                      e.target.value.trim() === "" ? null : Number(e.target.value),
                  })
                }
                placeholder="—"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="settings-row" style={{ alignItems: "flex-start", marginTop: 18 }}>
        <div>
          <div className="settings-row__label">Global instructions</div>
          <div className="settings-row__hint">
            Tone, style, statements shared by all sections
          </div>
        </div>
        <textarea
          className="response-comment-input"
          style={{ minHeight: 70 }}
          value={consignes_globales}
          onChange={(e) =>
            onChange({ ...value, consignes_globales: e.target.value })
          }
          placeholder="e.g. formal register, factual tone, always cite our certifications, no superlatives."
        />
      </div>
    </div>
  );
}
