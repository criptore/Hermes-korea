"""Routes du profil métier structuré (MNEMOSYNE `parametres`) et du profil de démo."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlmodel import Session

from hermes import profil_demo
from hermes.agents import pythia
from hermes.agents.profil_metier import (
    ProfilMetier,
    charger_profil,
    enregistrer_profil,
)
from hermes.api import pythia as pythia_api
from hermes.db.session import get_session

router = APIRouter(prefix="/profil", tags=["profil"])

SessionDep = Annotated[Session, Depends(get_session)]


@router.get("/metier", response_model=ProfilMetier)
def lire_profil_metier(session: SessionDep) -> ProfilMetier:
    return charger_profil(session)


@router.put("/metier", response_model=ProfilMetier)
def ecrire_profil_metier(profil: ProfilMetier, session: SessionDep) -> ProfilMetier:
    return enregistrer_profil(session, profil)


class ProfilDemoRequest(BaseModel):
    # Optionnel : active aussi Gemini en priorité (repli PYTHIA local).
    gemini_cle: str | None = Field(default=None, max_length=300)
    activer_gemini: bool = False


class ProfilDemoResponse(BaseModel):
    mots_cles_inclus: list[str]
    mots_cles_exclus: list[str]
    seuil_score: float
    max_par_cycle: int
    gemini_actif: bool


@router.post("/demo", response_model=ProfilDemoResponse)
def charger_profil_demo(payload: ProfilDemoRequest, session: SessionDep) -> ProfilDemoResponse:
    """Charge le profil de base de démo (profil métier, veille, workflow, pipeline)."""
    resume = profil_demo.appliquer(session)
    if payload.activer_gemini or payload.gemini_cle:
        pythia_api.enregistrer_gemini(session, actif=True, cle=payload.gemini_cle)
    return ProfilDemoResponse(
        mots_cles_inclus=list(resume.mots_cles_inclus),
        mots_cles_exclus=list(resume.mots_cles_exclus),
        seuil_score=resume.seuil_score,
        max_par_cycle=resume.max_par_cycle,
        gemini_actif=pythia.gemini_pret(),
    )
