import { useEffect, useState } from "react";
import { api, type ConfigGemini } from "../lib/api";

/**
 * Réglage « Gemini en priorité » (profil démo) : clé API chiffrée côté backend,
 * PYTHIA local en repli. Exception explicite au local-first, désactivée par défaut.
 */
export function GeminiReglage() {
  const [config, setConfig] = useState<ConfigGemini | null>(null);
  const [cle, setCle] = useState("");
  const [modele, setModele] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    api
      .lireGemini()
      .then((c) => {
        setConfig(c);
        setModele(c.modele);
      })
      .catch((e) => setErreur(e instanceof Error ? e.message : String(e)));
  }, []);

  const enregistrer = async (changement: {
    actif: boolean;
    cle?: string;
    effacer_cle?: boolean;
  }) => {
    setEnCours(true);
    setErreur(null);
    setMessage(null);
    try {
      const c = await api.ecrireGemini({ ...changement, modele: modele.trim() || undefined });
      setConfig(c);
      setCle("");
      setMessage(
        c.actif && c.cle_configuree
          ? `Gemini (${c.modele}) is now used first; local PYTHIA takes over if it fails.`
          : "Local PYTHIA only.",
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEnCours(false);
    }
  };

  if (!config) {
    return (
      <div style={{ color: "var(--fg-3)", fontSize: 13 }}>{erreur ?? "Loading…"}</div>
    );
  }

  return (
    <>
      <div className="settings-row">
        <div>
          <div className="settings-row__label">Use Gemini first</div>
          <div className="settings-row__hint">
            KRINOS and HERMION call Google's Gemini API, with local PYTHIA as fallback.
            Tender text is sent to Google while this is on.
          </div>
        </div>
        <button
          className={`toggle${config.actif ? " toggle--on" : ""}`}
          role="switch"
          aria-checked={config.actif}
          disabled={enCours || (!config.actif && !config.cle_configuree && !cle.trim())}
          onClick={() => void enregistrer({ actif: !config.actif, cle: cle.trim() || undefined })}
          title={config.cle_configuree || cle.trim() ? undefined : "Enter an API key first"}
        >
          <div className="toggle__thumb" />
        </button>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-row__label">Gemini API key</div>
          <div className="settings-row__hint">
            {config.cle_depuis_env
              ? "Provided by HERMES_GEMINI_API_KEY."
              : config.cle_configuree
                ? "Key saved (encrypted on this computer). Paste a new one to replace it."
                : "From Google AI Studio. Stored encrypted, never shown again."}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="input"
            type="password"
            autoComplete="off"
            placeholder="API key"
            value={cle}
            disabled={config.cle_depuis_env}
            onChange={(e) => setCle(e.target.value)}
          />
          <button
            className="btn btn--gold"
            disabled={enCours || !cle.trim()}
            onClick={() => void enregistrer({ actif: true, cle: cle.trim() })}
          >
            Save
          </button>
          {config.cle_configuree && !config.cle_depuis_env && (
            <button
              className="btn btn--ghost"
              disabled={enCours}
              onClick={() => void enregistrer({ actif: false, effacer_cle: true })}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-row__label">Gemini model</div>
          <div className="settings-row__hint">Default: gemini-3.5-flash (fast, structured output)</div>
        </div>
        <input
          className="input"
          value={modele}
          onChange={(e) => setModele(e.target.value)}
          onBlur={() => {
            if (modele.trim() && modele.trim() !== config.modele) {
              void enregistrer({ actif: config.actif });
            }
          }}
        />
      </div>

      {(message || erreur) && (
        <div className="settings-row__hint" style={{ color: erreur ? "var(--hermion)" : "var(--fg-2)" }}>
          {erreur ? `Error: ${erreur}` : message}
        </div>
      )}
    </>
  );
}
