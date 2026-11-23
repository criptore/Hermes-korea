"""Endpoints REST pour PYTHIA — gestion des modèles Ollama.

Ces routes permettent au frontend de vérifier qu'un modèle est installé
localement et de lancer son téléchargement (Qwen3 8B ~5,2 Go) avec un
état partagé en mémoire pour suivre la progression via polling.
"""

from __future__ import annotations

import asyncio
import base64
import json
import shutil
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from pydantic import BaseModel, Field
from sqlmodel import Session

from hermes.agents import pythia
from hermes.config import settings
from hermes.db.models import Parametre
from hermes.db.session import get_session
from hermes.securite.credentials import (
    ErreurCredentials,
    chiffrer_credentials,
    dechiffrer_credentials,
)

router = APIRouter(prefix="/pythia", tags=["pythia"])

# Modèle choisi par l'utilisateur (parmi les modèles déjà installés), persisté
# dans MNEMOSYNE pour survivre au redémarrage.
CLE_MODELE = "pythia.modele"
# Gemini (profil démo) : activation, modèle et clé API chiffrée (AES-256-GCM).
CLE_GEMINI = "pythia.gemini"


def appliquer_modele_persiste(session: Session) -> None:
    """Applique au démarrage le modèle choisi en base.

    Priorité : HERMES_PYTHIA_MODELE explicite > paramètre en base > défaut.
    """
    if settings.pythia_modele_explicite:
        return
    entree = session.get(Parametre, CLE_MODELE)
    if entree and entree.valeur.strip():
        settings.pythia_modele = entree.valeur.strip()


# --------------------------------------------------------------------------- #
# Gemini (profil démo) — persistance
# --------------------------------------------------------------------------- #


def _lire_gemini(session: Session) -> dict:
    entree = session.get(Parametre, CLE_GEMINI)
    if entree is None:
        return {}
    try:
        data = json.loads(entree.valeur)
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def _cle_dechiffree(data: dict) -> str:
    blob = data.get("cle_chiffree")
    if not isinstance(blob, str) or not blob:
        return ""
    try:
        return (dechiffrer_credentials(base64.b64decode(blob)) or {}).get("cle", "")
    except (ErreurCredentials, ValueError):
        logger.warning("PYTHIA: stored Gemini key cannot be decrypted (master key changed?)")
        return ""


def appliquer_gemini_persiste(session: Session) -> None:
    """Applique au démarrage le réglage Gemini de MNEMOSYNE.

    La variable HERMES_GEMINI_API_KEY, si fournie, prime sur la clé en base.
    """
    data = _lire_gemini(session)
    if not data:
        return
    settings.gemini_actif = bool(data.get("actif"))
    modele = str(data.get("modele") or "").strip()
    if modele:
        settings.gemini_modele = modele
    if not settings.gemini_cle_env:
        settings.gemini_api_key = _cle_dechiffree(data)


def enregistrer_gemini(
    session: Session,
    *,
    actif: bool,
    modele: str | None = None,
    cle: str | None = None,
    effacer_cle: bool = False,
) -> None:
    """Persiste et applique le réglage Gemini (clé chiffrée, jamais relue en clair)."""
    data = _lire_gemini(session)
    data["actif"] = actif
    if modele and modele.strip():
        data["modele"] = modele.strip()
    if effacer_cle:
        data.pop("cle_chiffree", None)
    elif cle and cle.strip():
        data["cle_chiffree"] = base64.b64encode(
            chiffrer_credentials({"cle": cle.strip()})
        ).decode("ascii")
    entree = session.get(Parametre, CLE_GEMINI) or Parametre(
        cle=CLE_GEMINI, valeur="{}", description="Gemini (demo profile): enabled, model, key"
    )
    entree.valeur = json.dumps(data)
    entree.maj_le = datetime.now(UTC)
    session.add(entree)
    session.commit()
    settings.gemini_actif = actif
    if data.get("modele"):
        settings.gemini_modele = data["modele"]
    if not settings.gemini_cle_env:
        settings.gemini_api_key = _cle_dechiffree(data)


# --------------------------------------------------------------------------- #
# État partagé (singleton in-memory)
# --------------------------------------------------------------------------- #


@dataclass
class EtatTelechargement:
    modele: str = ""
    en_cours: bool = False
    statut: str = ""
    octets_telecharges: int = 0
    octets_total: int = 0
    erreur: str | None = None
    termine_le: float | None = None
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    _tache: asyncio.Task | None = None


_etat = EtatTelechargement()


def etat_global() -> EtatTelechargement:
    return _etat


EtatDep = Annotated[EtatTelechargement, Depends(etat_global)]


# --------------------------------------------------------------------------- #
# Schémas API
# --------------------------------------------------------------------------- #


class ProgressionRead(BaseModel):
    modele: str
    en_cours: bool
    statut: str
    octets_telecharges: int
    octets_total: int
    pourcent: float
    erreur: str | None
    termine_le: float | None


class StatutModeleResponse(BaseModel):
    modele: str
    installe: bool
    ollama_disponible: bool
    progression: ProgressionRead


class TelechargementRequest(BaseModel):
    # Consentement explicite : aucun téléchargement sans `confirme: true`.
    modele: str
    confirme: bool = False


class ChoixModeleRequest(BaseModel):
    modele: str


class ModelePropose(BaseModel):
    nom: str
    taille_octets: int  # indicative (pas de consultation du registre Ollama)
    installe: bool


class OptionsModelesResponse(BaseModel):
    modele_actuel: str
    proposes: list[ModelePropose]
    installes: list[str]
    espace_disque_libre_octets: int
    modele_libre: bool


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #


class GeminiRead(BaseModel):
    actif: bool
    modele: str
    cle_configuree: bool
    # Clé fournie par HERMES_GEMINI_API_KEY : non modifiable depuis l'UI.
    cle_depuis_env: bool


class GeminiWrite(BaseModel):
    actif: bool
    modele: str | None = Field(default=None, max_length=80)
    cle: str | None = Field(default=None, max_length=300)
    effacer_cle: bool = False


def _gemini_read() -> GeminiRead:
    return GeminiRead(
        actif=settings.gemini_actif,
        modele=settings.gemini_modele,
        cle_configuree=bool(settings.gemini_api_key.strip()),
        cle_depuis_env=settings.gemini_cle_env,
    )


@router.get("/gemini", response_model=GeminiRead)
def lire_gemini() -> GeminiRead:
    return _gemini_read()


@router.put("/gemini", response_model=GeminiRead)
def ecrire_gemini(
    payload: GeminiWrite, session: Annotated[Session, Depends(get_session)]
) -> GeminiRead:
    """Active Gemini en priorité (repli PYTHIA local) et enregistre la clé chiffrée."""
    enregistrer_gemini(
        session,
        actif=payload.actif,
        modele=payload.modele,
        cle=payload.cle,
        effacer_cle=payload.effacer_cle,
    )
    return _gemini_read()


@router.get("/modele/status", response_model=StatutModeleResponse)
async def statut_modele(etat: EtatDep) -> StatutModeleResponse:
    modele_demande = etat.modele or settings.pythia_modele
    if pythia.gemini_pret():
        # Gemini actif : PYTHIA est prêt même sans modèle local installé.
        return StatutModeleResponse(
            modele=settings.gemini_modele,
            installe=True,
            ollama_disponible=True,
            progression=_progression_read(etat),
        )
    ollama_ok = await pythia.est_disponible(timeout=2.0)
    installe = False
    if ollama_ok:
        try:
            installe = await pythia.modele_installe(modele_demande)
        except pythia.ErreurPythia:
            installe = False

    return StatutModeleResponse(
        modele=modele_demande,
        installe=installe,
        ollama_disponible=ollama_ok,
        progression=_progression_read(etat),
    )


@router.get("/modele/options", response_model=OptionsModelesResponse)
async def options_modeles() -> OptionsModelesResponse:
    """Modèles proposés (liste blanche) et modèles déjà installés dans Ollama."""
    installes: list[str] = []
    if await pythia.est_disponible(timeout=2.0):
        try:
            installes = await pythia.lister_modeles()
        except pythia.ErreurPythia:
            installes = []
    proposes = [
        ModelePropose(
            nom=nom,
            taille_octets=taille,
            installe=any(_meme_modele(nom, i) for i in installes),
        )
        for nom, taille in settings.pythia_modeles_proposes.items()
    ]
    dossier = settings.db_path.parent
    dossier.mkdir(parents=True, exist_ok=True)
    return OptionsModelesResponse(
        modele_actuel=settings.pythia_modele,
        proposes=proposes,
        installes=installes,
        espace_disque_libre_octets=shutil.disk_usage(dossier).free,
        modele_libre=settings.pythia_modele_libre,
    )


@router.post("/modele/choisir", response_model=StatutModeleResponse)
async def choisir_modele(
    payload: ChoixModeleRequest,
    etat: EtatDep,
    session: Annotated[Session, Depends(get_session)],
) -> StatutModeleResponse:
    """Utilise un modèle DÉJÀ installé, sans rien télécharger (persisté en base)."""
    if not await pythia.est_disponible(timeout=2.0):
        raise HTTPException(status_code=502, detail="Ollama/PYTHIA is not reachable.")
    if not await pythia.modele_installe(payload.modele):
        raise HTTPException(status_code=404, detail="This model is not installed in Ollama.")
    settings.pythia_modele = payload.modele
    entree = session.get(Parametre, CLE_MODELE) or Parametre(
        cle=CLE_MODELE, valeur=payload.modele, description="Selected PYTHIA model"
    )
    entree.valeur = payload.modele
    entree.maj_le = datetime.now(UTC)
    session.add(entree)
    session.commit()
    etat.modele = payload.modele
    return await statut_modele(etat)


@router.post("/modele/telecharger", response_model=ProgressionRead)
async def lancer_telechargement(
    payload: TelechargementRequest,
    etat: EtatDep,
) -> ProgressionRead:
    """Démarre le téléchargement du modèle en tâche de fond.

    Exige `confirme: true` et un modèle de la liste blanche (sauf option
    avancée `pythia_modele_libre`). Idempotent : si un téléchargement est déjà
    en cours, renvoie son état actuel sans en lancer un nouveau.
    """
    if not payload.confirme:
        raise HTTPException(
            status_code=400,
            detail="Download not confirmed: `confirme` must be true.",
        )
    modele = payload.modele.strip()
    if not modele:
        raise HTTPException(status_code=422, detail="Empty model name.")
    if modele not in settings.pythia_modeles_proposes and not settings.pythia_modele_libre:
        raise HTTPException(
            status_code=403,
            detail="Model not in the offered list (advanced option disabled).",
        )

    async with etat._lock:
        if etat.en_cours:
            return _progression_read(etat)

        if not await pythia.est_disponible(timeout=2.0):
            raise HTTPException(
                status_code=502,
                detail="Ollama/PYTHIA is not reachable on 127.0.0.1:11434.",
            )

        # Réinitialise l'état pour ce nouveau téléchargement
        etat.modele = modele
        etat.en_cours = True
        etat.statut = "demarrage"
        etat.octets_telecharges = 0
        etat.octets_total = 0
        etat.erreur = None
        etat.termine_le = None

    # Lance la tâche en arrière-plan, ne pas await ici.
    etat._tache = asyncio.create_task(_executer_telechargement(etat, modele))
    return _progression_read(etat)


@router.post("/modele/annuler", response_model=ProgressionRead)
async def annuler_telechargement(etat: EtatDep) -> ProgressionRead:
    """Annule le téléchargement en cours (Ollama reprendra les blobs déjà reçus)."""
    tache = etat._tache
    if etat.en_cours and tache is not None and not tache.done():
        tache.cancel()
        try:
            await tache
        except asyncio.CancelledError:
            pass
    return _progression_read(etat)


def _meme_modele(a: str, b: str) -> bool:
    def norm(n: str) -> str:
        return n if ":" in n else f"{n}:latest"

    return norm(a) == norm(b)


async def _executer_telechargement(etat: EtatTelechargement, modele: str) -> None:
    try:
        async for evt in pythia.telecharger_modele(modele):
            erreur = evt.get("error")
            if erreur:
                raise pythia.ErreurPythia(str(erreur))
            statut = str(evt.get("status") or "").lower()
            etat.statut = statut[:120]
            completed = evt.get("completed")
            total = evt.get("total")
            if isinstance(total, int) and total > 0:
                etat.octets_total = total
            if isinstance(completed, int) and completed >= 0:
                etat.octets_telecharges = completed
        # Fin du stream sans erreur → succès
        etat.statut = "success"
        if etat.octets_total > 0:
            etat.octets_telecharges = etat.octets_total
        etat.termine_le = time.time()
    except asyncio.CancelledError:
        etat.statut = "annule"
        etat.erreur = None
    except pythia.ErreurPythia as exc:
        etat.erreur = str(exc)
        etat.statut = "erreur"
    except Exception as exc:  # noqa: BLE001 — on capture tout pour ne pas geler l'état
        etat.erreur = f"Unexpected error: {exc}"
        etat.statut = "erreur"
    finally:
        etat.en_cours = False


def _progression_read(etat: EtatTelechargement) -> ProgressionRead:
    pourcent = 0.0
    if etat.octets_total > 0:
        pourcent = min(100.0, 100.0 * etat.octets_telecharges / etat.octets_total)
    return ProgressionRead(
        modele=etat.modele or settings.pythia_modele,
        en_cours=etat.en_cours,
        statut=etat.statut,
        octets_telecharges=etat.octets_telecharges,
        octets_total=etat.octets_total,
        pourcent=round(pourcent, 1),
        erreur=etat.erreur,
        termine_le=etat.termine_le,
    )
