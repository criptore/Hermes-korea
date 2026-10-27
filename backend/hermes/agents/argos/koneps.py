"""Scraper KONEPS — 나라장터 (Korea ON-line E-Procurement System, 조달청).

Source : OpenAPI officielle « 조달청_나라장터 입찰공고정보서비스 » publiée sur
le portail open data coréen <https://www.data.go.kr>.

URL exploitée (une opération par nature de marché) :
    GET https://apis.data.go.kr/1230000/ad/BidPublicInfoService/
        getBidPblancListInfo{Thng|Servc|Cnstwk}PPSSrch

Caractéristiques :
- API publique **gratuite** ; elle exige une clé de service (``serviceKey``)
  obtenue en un clic sur data.go.kr (compte gratuit, demande d'utilisation de
  l'API). La clé est saisie dans Paramètres → Portails et stockée **chiffrée**
  (`portails.credentials_chiffres`, clé ``service_key``), ou fournie par
  ``HERMES_KONEPS_SERVICE_KEY``.
- Requête par fenêtre de dates de mise en ligne (``inqryDiv=1``,
  ``inqryBgnDt``/``inqryEndDt`` au format ``YYYYMMDDHHMM``, ≤ 1 mois).
- Filtrage serveur : ``bidNtceNm`` (sous-chaîne du titre de l'avis), une
  requête par mot-clé inclus — c'est le rôle des opérations ``…PPSSrch``.
- Réponse JSON ``{"response": {"header": {...}, "body": {"items": [...],
  "totalCount": N}}}`` ; ``items`` peut aussi valoir ``{"item": [...]}``,
  ``{"item": {...}}`` ou ``""`` selon le volume. Une clé refusée renvoie un
  corps **XML** (``SERVICE_KEY_IS_NOT_REGISTERED_ERROR``…) même avec
  ``type=json`` : on le détecte pour afficher un message clair.

Dates : les horodatages KONEPS sont en heure de Séoul (KST, UTC+9) ; ils sont
convertis en datetimes UTC timezone-aware.
"""

from __future__ import annotations

import json
import os
import re
from datetime import UTC, datetime, timedelta, timezone
from typing import Any

import httpx

from hermes.agents.argos.base import (
    MARGE_INCREMENTALE,
    MAX_PAGES,
    TAILLE_PAGE,
    AOCollecte,
    CriteresAvances,
    Scraper,
)
from hermes.agents.argos.capabilities import PROFIL_KONEPS
from hermes.agents.argos.reseau import requeter_avec_retry

API_BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService"

# Nature canonique → (suffixe d'opération, libellé affiché en type de marché).
OPERATIONS: dict[str, tuple[str, str]] = {
    "fournitures": ("getBidPblancListInfoThngPPSSrch", "Goods"),
    "services": ("getBidPblancListInfoServcPPSSrch", "Services"),
    "travaux": ("getBidPblancListInfoCnstwkPPSSrch", "Works"),
}

KST = timezone(timedelta(hours=9), "KST")

# Première collecte : on remonte une semaine (≈ 3 000 avis/jour sur KONEPS, le
# filtre mots-clés serveur réduit fortement le volume). Fenêtre plafonnée à
# 30 jours, limite documentée de l'API.
FENETRE_INITIALE = timedelta(days=7)
FENETRE_MAX = timedelta(days=30)

# Au-delà, on ne pousse plus les mots-clés un par un (une requête chacun) :
# collecte non filtrée, le filtre client du runner fait le tri.
MAX_MOTS_CLES_SERVEUR = 10

_UA = "Mozilla/5.0 (compatible; HERMES/1.1; local desktop app) httpx"
_CODES_OK = {"00", "0", "000", "INFO-000"}
_RE_ERREUR_XML = re.compile(r"<(?:returnAuthMsg|errMsg|resultMsg)>([^<]+)<")


class ErreurKoneps(RuntimeError):
    """Réponse KONEPS inexploitable (clé manquante ou refusée, erreur API)."""


class KonepsScraper(Scraper):
    """Avis d'appel d'offres publics coréens (나라장터) via data.go.kr."""

    nom = "koneps"
    url_base = "https://www.g2b.go.kr"
    capacites = PROFIL_KONEPS

    def __init__(self, timeout: float = 30.0):
        self._timeout = timeout
        # Injectés par le runner (même contrat que les autres scrapers).
        self.credentials: dict[str, str] = {}
        self.filtre_inclus: tuple[str, ...] = ()
        self.filtre_exclus: tuple[str, ...] = ()
        self.criteres: CriteresAvances = CriteresAvances()
        self.depuis: datetime | None = None
        # Horloge injectable pour les tests.
        self.maintenant = lambda: datetime.now(UTC)

    def _cle_service(self) -> str:
        cle = (self.credentials.get("service_key") or "").strip() or os.environ.get(
            "HERMES_KONEPS_SERVICE_KEY", ""
        ).strip()
        if not cle:
            raise ErreurKoneps(
                "KONEPS: no data.go.kr service key. Get a free key for the "
                "'조달청_나라장터 입찰공고정보서비스' API on data.go.kr, then add it "
                "in Settings → Monitored portals → KONEPS."
            )
        return cle

    def _fenetre(self) -> tuple[datetime, datetime]:
        fin = self.maintenant()
        if self.depuis is None:
            debut = fin - FENETRE_INITIALE
        else:
            debut = self.depuis - MARGE_INCREMENTALE
        return max(debut, fin - FENETRE_MAX), fin

    def _operations(self) -> list[tuple[str, str]]:
        natures = [n for n in self.criteres.natures if n in OPERATIONS]
        return [OPERATIONS[n] for n in (natures or OPERATIONS)]

    def _termes(self) -> list[str | None]:
        termes = [t.strip() for t in self.filtre_inclus if t.strip()]
        if not termes or len(termes) > MAX_MOTS_CLES_SERVEUR:
            return [None]
        return list(dict.fromkeys(termes))

    async def collecter(self, limite: int = 20) -> list[AOCollecte]:
        self.collecte_partielle = False
        cle = self._cle_service()
        debut, fin = self._fenetre()

        vus: dict[str, AOCollecte] = {}
        for operation, libelle in self._operations():
            for terme in self._termes():
                items = await self._collecter_pagine(cle, operation, debut, fin, terme)
                for item in items:
                    ao = item_vers_ao(item, libelle)
                    if ao is not None:
                        vus.setdefault(ao.cle_unicite(), ao)
        return list(vus.values())

    async def _collecter_pagine(
        self,
        cle: str,
        operation: str,
        debut: datetime,
        fin: datetime,
        terme: str | None,
    ) -> list[dict[str, Any]]:
        """Pagine jusqu'à `totalCount` ou au plafond de pages.

        Lève si la première page échoue ; un échec ultérieur rend ce qui a été
        collecté et marque la collecte comme partielle.
        """
        cumul: list[dict[str, Any]] = []
        for page in range(1, MAX_PAGES + 1):
            try:
                items, total = await self._requeter(cle, operation, debut, fin, terme, page)
            except (httpx.HTTPError, ErreurKoneps):
                if page == 1:
                    raise
                self.collecte_partielle = True
                break
            cumul.extend(items)
            if not items or page * TAILLE_PAGE >= total:
                break
        else:
            # Plafond atteint alors qu'il restait des pages : fenêtre incomplète.
            self.collecte_partielle = True
        return cumul

    async def _requeter(
        self,
        cle: str,
        operation: str,
        debut: datetime,
        fin: datetime,
        terme: str | None,
        page: int,
    ) -> tuple[list[dict[str, Any]], int]:
        params: dict[str, str | int] = {
            "serviceKey": cle,
            "pageNo": page,
            "numOfRows": TAILLE_PAGE,
            "type": "json",
            "inqryDiv": 1,
            "inqryBgnDt": _format_kst(debut),
            "inqryEndDt": _format_kst(fin),
        }
        if terme:
            params["bidNtceNm"] = terme

        async def envoyer() -> httpx.Response:
            async with httpx.AsyncClient(
                timeout=self._timeout,
                headers={"User-Agent": _UA, "Accept": "application/json"},
                follow_redirects=True,
            ) as client:
                return await client.get(f"{API_BASE}/{operation}", params=params)

        r = await requeter_avec_retry(envoyer, nom="KONEPS")
        if r.status_code in (401, 403):
            raise ErreurKoneps(
                f"KONEPS: data.go.kr refused the service key (HTTP {r.status_code})."
            )
        r.raise_for_status()
        return lire_reponse(r.text)


# --------------------------------------------------------------------------- #
# Lecture de la réponse
# --------------------------------------------------------------------------- #


def lire_reponse(texte: str) -> tuple[list[dict[str, Any]], int]:
    """Décode une réponse data.go.kr : (items, totalCount). Lève ErreurKoneps."""
    brut = texte.lstrip()
    if brut.startswith("<"):
        m = _RE_ERREUR_XML.search(brut)
        detail = m.group(1).strip() if m else "unexpected XML response"
        raise ErreurKoneps(f"KONEPS: data.go.kr error ({detail}).")
    try:
        data = json.loads(brut)
    except ValueError as exc:
        raise ErreurKoneps("KONEPS: response is not valid JSON.") from exc

    reponse = data.get("response") if isinstance(data, dict) else None
    if not isinstance(reponse, dict):
        raise ErreurKoneps("KONEPS: unexpected response structure.")
    entete = reponse.get("header") or {}
    code = str(entete.get("resultCode", "00")).strip()
    if code not in _CODES_OK:
        msg = str(entete.get("resultMsg") or "").strip()
        raise ErreurKoneps(f"KONEPS: data.go.kr error {code} ({msg}).")

    corps = reponse.get("body") or {}
    items = corps.get("items")
    if isinstance(items, dict):
        items = items.get("item")
    if isinstance(items, dict):
        items = [items]
    if not isinstance(items, list):
        items = []
    try:
        total = int(corps.get("totalCount") or 0)
    except (TypeError, ValueError):
        total = 0
    return [i for i in items if isinstance(i, dict)], total


# --------------------------------------------------------------------------- #
# Conversion item → AOCollecte
# --------------------------------------------------------------------------- #


def item_vers_ao(item: dict[str, Any], type_marche: str | None = None) -> AOCollecte | None:
    """Convertit un avis KONEPS ; None s'il n'a ni numéro ni titre."""
    numero = _texte(item.get("bidNtceNo"))
    titre = _texte(item.get("bidNtceNm"))
    if not numero or not titre:
        return None
    ordre = _texte(item.get("bidNtceOrd")) or "000"
    reference = f"{numero}-{ordre}"

    if len(titre) > 500:
        titre = titre[:497] + "…"

    emetteur = _texte(item.get("ntceInsttNm")) or _texte(item.get("dminsttNm"))
    demandeur = _texte(item.get("dminsttNm"))
    details = [
        f"Notice: {titre}",
        f"Issuing agency: {emetteur}" if emetteur else None,
        f"Demand agency: {demandeur}" if demandeur and demandeur != emetteur else None,
        f"Bid method: {_texte(item.get('bidMethdNm'))}" if item.get("bidMethdNm") else None,
        (
            f"Contract method: {_texte(item.get('cntrctCnclsMthdNm'))}"
            if item.get("cntrctCnclsMthdNm")
            else None
        ),
        f"Opening: {_texte(item.get('opengDt'))}" if item.get("opengDt") else None,
    ]

    return AOCollecte(
        titre=titre,
        url_source=_texte(item.get("bidNtceDtlUrl"))
        or _texte(item.get("bidNtceUrl"))
        or url_par_defaut(numero, ordre),
        reference_externe=reference,
        emetteur=emetteur,
        objet="\n".join(d for d in details if d)[:1000],
        budget_estime=_montant(item.get("asignBdgtAmt")) or _montant(item.get("presmptPrce")),
        devise="KRW",
        date_publication=parse_date_kst(item.get("bidNtceDt")),
        date_limite=parse_date_kst(item.get("bidClseDt")),
        type_marche=type_marche or _texte(item.get("ntceKindNm")),
        zone_geographique="KOR",
        liens_documents=_liens_documents(item),
    )


def url_par_defaut(numero: str, ordre: str) -> str:
    return (
        "https://www.g2b.go.kr:8081/ep/invitation/publish/bidInfoDtl.do"
        f"?bidno={numero}&bidseq={ordre}"
    )


def _liens_documents(item: dict[str, Any]) -> list[str]:
    """Pièces du dossier publiées avec l'avis (``ntceSpecDocUrl1..10``)."""
    urls: list[str] = []
    for i in range(1, 11):
        url = _texte(item.get(f"ntceSpecDocUrl{i}"))
        if url and url.startswith("http") and url not in urls:
            urls.append(url)
    return urls


def parse_date_kst(valeur: Any) -> datetime | None:
    """``2026-10-27 10:00:00`` / ``2026-10-27 10:00`` / ``20261027`` (KST) → UTC."""
    s = _texte(valeur)
    if not s:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d", "%Y%m%d%H%M", "%Y%m%d"):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=KST).astimezone(UTC)
        except ValueError:
            continue
    return None


def _format_kst(moment: datetime) -> str:
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return moment.astimezone(KST).strftime("%Y%m%d%H%M")


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
    s = str(valeur).strip()
    return s or None
