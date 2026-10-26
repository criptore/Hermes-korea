import { useRef } from "react";
import { api, type AnalyseConcurrence } from "../lib/api";
import { useApi } from "../lib/useApi";

/**
 * Encart « Concurrence (DECP) » de la fiche AO : historique open data des
 * marchés attribués au même acheteur (SIRET) et dans le même secteur (CPV) sur
 * 3 ans — titulaires récurrents, montant médian, tendance.
 */
export function ConcurrenceDecp({ aoId }: { aoId: number }) {
  // `actualiser` n'est vrai que pour le clic explicite (ignore le cache 24 h).
  const forcer = useRef(false);
  const { data, error, loading, reload } = useApi(
    (signal) => {
      const actualiser = forcer.current;
      forcer.current = false;
      return api.concurrenceAO(aoId, actualiser, signal);
    },
    [aoId],
  );

  return (
    <div className="tender-panel__section" data-testid="concurrence-decp">
      <div className="tender-panel__section-title">
        Competition (DECP)
        <button
          className="btn btn--ghost"
          style={{ marginLeft: "auto", padding: "2px 8px", fontSize: 11 }}
          disabled={loading}
          onClick={() => {
            forcer.current = true;
            void reload();
          }}
          title="Query DECP again, ignoring the local cache (24 h)"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {loading && !data && <p className="tender-panel__summary">Querying DECP…</p>}
      {error && !data && (
        <p className="tender-panel__summary" role="alert">
          History unavailable: {error}
        </p>
      )}
      {data?.message && (
        <p style={{ fontSize: 12, color: "var(--fg-3)", margin: "0 0 10px" }}>{data.message}</p>
      )}
      {data?.acheteur && <Bloc titre="Same buyer" analyse={data.acheteur} />}
      {data?.secteur && (
        <Bloc titre={`Same sector (CPV ${data.cpv?.slice(0, 4) ?? ""}…)`} analyse={data.secteur} />
      )}
      {data?.maj_le && (
        <p style={{ fontSize: 11, color: "var(--fg-4)", margin: "6px 0 0" }}>
          Source: data.gouv.fr (consolidated DECP) · {data.depuis_cache ? "local cache" : "up to date"}{" "}
          as of {new Date(data.maj_le).toLocaleDateString("en-GB")}
        </p>
      )}
    </div>
  );
}

const TENDANCES: Record<string, string> = {
  hausse: "↗ rising",
  baisse: "↘ falling",
  stable: "→ stable",
  indeterminee: "undetermined",
};

function frDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-GB") : "?";
}

function euros(v: number | null): string {
  return v == null ? "—" : `${Math.round(v).toLocaleString("en-GB")} €`;
}

function Bloc({ titre, analyse }: { titre: string; analyse: AnalyseConcurrence }) {
  if (analyse.nb_marches === 0) {
    return (
      <p style={{ fontSize: 12, color: "var(--fg-3)" }}>
        {titre}: no contracts awarded in {analyse.periode_annees} years.
      </p>
    );
  }
  const t = analyse.tendance;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-2)", marginBottom: 6 }}>
        {titre}
      </div>
      <dl className="kv">
        <dt>
          {analyse.echantillon_plafonne ? "Sample" : `Contracts (${analyse.periode_annees} years)`}
        </dt>
        <dd>
          {analyse.echantillon_plafonne
            ? `${analyse.nb_marches} most recent contracts${
                analyse.total_reel
                  ? ` out of ${analyse.total_reel.toLocaleString("en-GB")} in total`
                  : ""
              }, from ${frDate(analyse.periode_debut)} to ${frDate(analyse.periode_fin)}`
            : analyse.nb_marches}
        </dd>
        <dt>Median amount</dt>
        <dd>{euros(analyse.montant_median)}</dd>
        <dt>Bids received (avg.)</dt>
        <dd>{analyse.offres_moyennes ?? "—"}</dd>
        <dt>12-month trend</dt>
        <dd>
          {t.precedent_couvert
            ? `${TENDANCES[t.sens] ?? t.sens} — ${t.nb_recent} contract(s) vs ${t.nb_precedent} the previous year, median ${euros(t.montant_median_recent)} vs ${euros(t.montant_median_precedent)}`
            : "not computed (the sample does not cover the previous year)"}
        </dd>
      </dl>
      <div style={{ fontSize: 11, color: "var(--fg-3)", margin: "8px 0 4px" }}>
        Recurring winners
      </div>
      <ul className="keypoints">
        {analyse.titulaires.slice(0, 5).map((x) => (
          <li key={`${x.siret ?? x.nom}`}>
            {x.nom} — {x.nb_marches} contract(s), {euros(x.montant_total)}
          </li>
        ))}
      </ul>
    </div>
  );
}
