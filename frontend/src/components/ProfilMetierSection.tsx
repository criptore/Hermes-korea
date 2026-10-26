import { useEffect, useState, type ReactNode } from "react";
import { api, type ProfilMetier } from "../lib/api";
import type { UserProfile } from "../lib/userProfile";

const VIDE: ProfilMetier = {
  activite: "",
  secteurs: [],
  codes_cpv: [],
  zone_geographique: "",
  effectif: null,
  ca_tranche: "",
  certifications: [],
  types_marches: [],
  references_types: [],
};

const TRANCHES_CA = ["", "< 500 k€", "500 k€ - 2 M€", "2 - 10 M€", "10 - 50 M€", "> 50 M€"];

const enListe = (s: string, sep: RegExp = /[,\n]/) =>
  s.split(sep).map((x) => x.trim()).filter(Boolean);

function estVide(p: ProfilMetier): boolean {
  return JSON.stringify(p) === JSON.stringify(VIDE);
}

function Ligne({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div>
        <div className="settings-row__label">{label}</div>
        <div className="settings-row__hint">{hint}</div>
      </div>
      {children}
    </div>
  );
}

/**
 * Profil métier envoyé à KRINOS (PYTHIA, Laya). Aucune donnée d'identité :
 * nom, email et SIRET ne sont ni demandés ni acceptés par le backend.
 */
export function ProfilMetierSection({ legacy }: { legacy: UserProfile | null }) {
  const [p, setP] = useState<ProfilMetier>(VIDE);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Champs listes édités en texte brut (évite de re-parser à chaque frappe).
  const [txt, setTxt] = useState({ secteurs: "", cpv: "", certs: "", types: "", refs: "" });

  const appliquer = (profil: ProfilMetier) => {
    setP(profil);
    setTxt({
      secteurs: profil.secteurs.join(", "),
      cpv: profil.codes_cpv.join(", "),
      certs: profil.certifications.join(", "),
      types: profil.types_marches.join(", "),
      refs: profil.references_types.join("\n"),
    });
  };

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        let profil = await api.lireProfilMetier();
        // Migration douce : profil backend vide -> reprend l'activité du profil local.
        if (estVide(profil) && legacy?.activite.trim()) {
          profil = await api.ecrireProfilMetier({ ...VIDE, activite: legacy.activite.trim() });
          if (!annule) setMsg("Business activity imported from your local profile.");
        }
        if (!annule) appliquer(profil);
      } catch (e) {
        if (!annule) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!annule) setLoading(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [legacy]);

  const enregistrer = async () => {
    setError(null);
    setMsg(null);
    try {
      const saved = await api.ecrireProfilMetier({
        ...p,
        secteurs: enListe(txt.secteurs),
        codes_cpv: enListe(txt.cpv),
        certifications: enListe(txt.certs),
        types_marches: enListe(txt.types),
        references_types: enListe(txt.refs, /\n/),
      });
      appliquer(saved);
      setMsg("Business profile saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (loading) return <div className="settings-section">Loading…</div>;

  return (
    <div className="settings-section">
      <h2>Business profile</h2>
      <p className="settings-section__desc">
        Describes your expertise for KRINOS analysis (PYTHIA and the Laya second opinion).
        Do not include any identity data: names, emails and company IDs (SIRET) are rejected.
      </p>
      <Ligne label="Business activity" hint="e.g. Java IT services firm, project management consultancy">
        <input className="input" maxLength={400} value={p.activite}
          onChange={(e) => setP({ ...p, activite: e.target.value })} />
      </Ligne>
      <Ligne label="Sectors" hint="comma-separated">
        <input className="input" value={txt.secteurs}
          onChange={(e) => setTxt({ ...txt, secteurs: e.target.value })} />
      </Ligne>
      <Ligne label="CPV codes" hint="e.g. 72000000-5, 79411000-8">
        <input className="input" value={txt.cpv}
          onChange={(e) => setTxt({ ...txt, cpv: e.target.value })} />
      </Ligne>
      <Ligne label="Geographic area" hint="region, departments, nationwide…">
        <input className="input" maxLength={200} value={p.zone_geographique}
          onChange={(e) => setP({ ...p, zone_geographique: e.target.value })} />
      </Ligne>
      <Ligne label="Headcount" hint="number of people">
        <input className="input" type="number" min={0} value={p.effectif ?? ""}
          onChange={(e) =>
            setP({ ...p, effectif: e.target.value === "" ? null : Number(e.target.value) })} />
      </Ligne>
      <Ligne label="Revenue" hint="annual bracket">
        <select className="input" value={p.ca_tranche}
          onChange={(e) => setP({ ...p, ca_tranche: e.target.value })}>
          {TRANCHES_CA.map((t) => (
            <option key={t} value={t}>{t || "Not specified"}</option>
          ))}
        </select>
      </Ligne>
      <Ligne label="Certifications" hint="e.g. ISO 27001, Qualiopi">
        <input className="input" value={txt.certs}
          onChange={(e) => setTxt({ ...txt, certs: e.target.value })} />
      </Ligne>
      <Ligne label="Target contract types" hint="e.g. services, framework agreements">
        <input className="input" value={txt.types}
          onChange={(e) => setTxt({ ...txt, types: e.target.value })} />
      </Ligne>
      <Ligne label="Typical references" hint="one per line, no personal names">
        <textarea className="response-comment-input" style={{ minHeight: 100 }} value={txt.refs}
          onChange={(e) => setTxt({ ...txt, refs: e.target.value })} />
      </Ligne>

      <div style={{ marginTop: 16 }}>
        <button className="btn btn--gold" onClick={enregistrer}>Save</button>
        {msg && <span style={{ marginLeft: 12 }}>{msg}</span>}
        {error && <span style={{ marginLeft: 12, color: "#c0392b" }}>{error}</span>}
      </div>
    </div>
  );
}
