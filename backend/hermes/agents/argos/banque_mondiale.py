"""Scraper Banque mondiale — avis de passation des projets financés en Asie.

Source : API publique « procurement notices » de la Banque mondiale, sans clé :
    GET https://search.worldbank.org/api/v2/procnotices?format=json

Pourquoi ce portail pour un commercial coréen : les projets financés par la
Banque mondiale en Asie (Vietnam, Indonésie, Philippines, Mongolie, Asie
centrale, Asie du Sud…) sont ouverts à la concurrence internationale et
publiés en anglais — c'est le principal gisement d'AO export accessible
gratuitement, en complément des marchés domestiques KONEPS.

Paramètres utilisés :
- ``project_ctry_code_exact`` : codes ISO2 joints par ``^`` (OR). Défaut :
  `PAYS_ASIE` ; surchargé par le critère avancé ``pays`` (ISO3).
- ``srt=submission_date&order=desc`` : tri par date de publication (le champ
  ``submission_date`` est la date de publication, pas la date limite).
- ``rows`` / ``os`` : pagination par offset.

Seuls les avis ouvrant une mise en concurrence sont gardés : les attributions
de marché (« Contract Award ») sont écartées. Parseur défensif : la réponse
range les avis sous ``procnotices`` (liste ou objet indexé par id).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import httpx

from hermes.agents.argos.base import (
    MAX_PAGES,
    TAILLE_PAGE,
    AOCollecte,
    CriteresAvances,
    Scraper,
    borne_incrementale,
)
from hermes.agents.argos.capabilities import PROFIL_BANQUE_MONDIALE
from hermes.agents.argos.reseau import requeter_avec_retry

API_URL = "https://search.worldbank.org/api/v2/procnotices"
URL_AVIS = "https://projects.worldbank.org/en/projects-operations/procurement-detail/"

# Pays d'Asie couverts par défaut (ISO3 → ISO2 de l'API). Le critère avancé
# `pays` accepte ces codes ISO3 ; un code hors table est ignoré.
PAYS_ASIE: dict[str, str] = {
    # Asie du Sud-Est
    "VNM": "VN", "IDN": "ID", "PHL": "PH", "THA": "TH", "MYS": "MY",
    "KHM": "KH", "LAO": "LA", "MMR": "MM", "TLS": "TL",
    # Asie de l'Est
    "CHN": "CN", "MNG": "MN",
    # Asie du Sud
    "IND": "IN", "BGD": "BD", "LKA": "LK", "NPL": "NP", "BTN": "BT",
    "MDV": "MV", "PAK": "PK", "AFG": "AF",
    # Asie centrale
    "UZB": "UZ", "KAZ": "KZ", "KGZ": "KG", "TJK": "TJ", "TKM": "TM",
    # Pacifique
    "PNG": "PG", "FJI": "FJ", "SLB": "SB", "VUT": "VU", "WSM": "WS", "TON": "TO",
}

_CHAMPS = (
    "id,notice_type,notice_status,noticedate,submission_date,submission_deadline_date,"
    "submission_deadline_time,project_ctry_code,project_ctry_name,project_id,project_name,"
    "bid_reference_no,bid_description,procurement_group_desc,procurement_method_name,"
    "bid_estimate_amount,bid_currency_code,agency_name"
)

_UA = "Mozilla/5.0 (compatible; HERMES/1.1; local desktop app) httpx"


class BanqueMondialeScraper(Scraper):
    """Avis de la Banque mondiale pour les pays d'Asie (API publique)."""

    nom = "banque_mondiale"
    url_base = "https://projects.worldbank.org"
    capacites = PROFIL_BANQUE_MONDIALE

    def __init__(self, timeout: float = 30.0):
        self._timeout = timeout
        self.filtre_inclus: tuple[str, ...] = ()
        self.filtre_exclus: tuple[str, ...] = ()
        self.criteres: CriteresAvances = CriteresAvances()
        self.depuis: datetime | None = None

    def _codes_pays(self) -> list[str]:
        choisis = [PAYS_ASIE[p] for p in self.criteres.pays if p in PAYS_ASIE]
        return choisis or list(PAYS_ASIE.values())

    async def collecter(self, limite: int = 20) -> list[AOCollecte]:
        self.collecte_partielle = False
        borne = borne_incrementale(self.depuis)
        pays = "^".join(self._codes_pays())

        vus: dict[str, AOCollecte] = {}
        for page in range(MAX_PAGES):
            try:
                avis = await self._requeter(pays, page * TAILLE_PAGE)
            except httpx.HTTPError:
                if page == 0:
                    raise
                self.collecte_partielle = True
                break
            for a in avis:
                if not est_appel(a):
                    continue
                ao = avis_vers_ao(a)
                if ao is not None:
                    vus.setdefault(ao.cle_unicite(), ao)
            if len(avis) < TAILLE_PAGE:
                break
            if borne is not None and _page_anterieure(avis, borne):
                break
        return list(vus.values())

    async def _requeter(self, pays: str, offset: int) -> list[dict[str, Any]]:
        params = {
            "format": "json",
            "fl": _CHAMPS,
            "rows": TAILLE_PAGE,
            "os": offset,
            "srt": "submission_date",
            "order": "desc",
            "project_ctry_code_exact": pays,
        }

        async def envoyer() -> httpx.Response:
            async with httpx.AsyncClient(
                timeout=self._timeout,
                headers={"User-Agent": _UA, "Accept": "application/json"},
                follow_redirects=True,
            ) as client:
                return await client.get(API_URL, params=params)

        r = await requeter_avec_retry(envoyer, nom="World Bank")
        r.raise_for_status()
        return extraire_avis(r.json())


def extraire_avis(data: Any) -> list[dict[str, Any]]:
    """Liste des avis d'une réponse (``procnotices`` liste ou dict indexé)."""
    if not isinstance(data, dict):
        return []
    bloc = data.get("procnotices", data.get("documents"))
    if isinstance(bloc, dict):
        bloc = list(bloc.values())
    if not isinstance(bloc, list):
        return []
    return [a for a in bloc if isinstance(a, dict) and a.get("id")]


def est_appel(avis: dict[str, Any]) -> bool:
    """Faux pour les attributions et les brouillons : rien à soumissionner."""
    type_avis = (_texte(avis.get("notice_type")) or "").casefold()
    statut = (_texte(avis.get("notice_status")) or "").casefold()
    return "award" not in type_avis and statut != "draft"


def avis_vers_ao(avis: dict[str, Any]) -> AOCollecte | None:
    ident = _texte(avis.get("id"))
    description = _texte(avis.get("bid_description"))
    projet = _texte(avis.get("project_name"))
    titre = description or projet
    if not ident or not titre:
        return None
    if len(titre) > 500:
        titre = titre[:497] + "…"

    pays = _texte(avis.get("project_ctry_name"))
    details = [
        f"Project: {projet} ({_texte(avis.get('project_id')) or 'n/a'})" if projet else None,
        f"Country: {pays}" if pays else None,
        f"Notice: {description}" if description else None,
        f"Category: {_texte(avis.get('procurement_group_desc'))}"
        if avis.get("procurement_group_desc")
        else None,
        f"Method: {_texte(avis.get('procurement_method_name'))}"
        if avis.get("procurement_method_name")
        else None,
        f"Bid reference: {_texte(avis.get('bid_reference_no'))}"
        if avis.get("bid_reference_no")
        else None,
        f"Deadline (local time): {_texte(avis.get('submission_deadline_time'))}"
        if avis.get("submission_deadline_time")
        else None,
    ]

    return AOCollecte(
        titre=titre,
        url_source=URL_AVIS + ident,
        reference_externe=ident,
        emetteur=_texte(avis.get("agency_name")) or (f"World Bank — {pays}" if pays else None),
        objet="\n".join(d for d in details if d)[:1000],
        budget_estime=_montant(avis.get("bid_estimate_amount")),
        devise=_texte(avis.get("bid_currency_code")) or "USD",
        date_publication=_parse_date(avis.get("submission_date"))
        or _parse_date(avis.get("noticedate")),
        date_limite=_parse_date(avis.get("submission_deadline_date")),
        type_marche=_texte(avis.get("notice_type")),
        zone_geographique=_texte(avis.get("project_ctry_code")),
    )


def _page_anterieure(avis: list[dict[str, Any]], borne: datetime) -> bool:
    """Tri par publication décroissante : la page la plus ancienne bornera la suite."""
    for a in reversed(avis):
        d = _parse_date(a.get("submission_date"))
        if d is not None:
            return d < borne
    return True


def _parse_date(valeur: Any) -> datetime | None:
    s = _texte(valeur)
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        try:
            dt = datetime.strptime(s, "%d-%b-%Y")  # noticedate : 07-Oct-2026
        except ValueError:
            return None
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def _montant(valeur: Any) -> float | None:
    s = _texte(valeur)
    if not s:
        return None
    try:
        montant = float(s.replace(",", ""))
    except ValueError:
        return None
    return montant if montant > 0 else None


def _texte(valeur: Any) -> str | None:
    if valeur is None:
        return None
    if isinstance(valeur, list):
        valeur = valeur[0] if valeur else None
        if valeur is None:
            return None
    s = str(valeur).strip()
    return s or None
