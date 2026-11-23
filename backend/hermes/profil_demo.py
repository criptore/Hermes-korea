"""Profil de base (démo) — prêt en un clic pour montrer ARGOS → KRINOS → HERMION.

Pré-remplit MNEMOSYNE avec un profil plausible de PME IT coréenne : profil
métier, mots-clés de veille (coréen + anglais, ≤ 10 pour que KONEPS les filtre
côté serveur), workflow HERMION court et pipeline réglé pour une démo rapide
(peu d'AO par cycle, seuil abaissé). L'onboarding est marqué terminé.

Aucune collecte n'est lancée ici : la démo la déclenche quand l'utilisateur le
décide (bouton « Run demo »), pour que l'on voie les agents travailler tour à tour.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlmodel import Session

from hermes import onboarding
from hermes.agents.argos.base import CriteresAvances
from hermes.agents.argos.filtre import FiltreVeille, enregistrer_criteres, enregistrer_filtre
from hermes.agents.hermion.workflow import (
    SectionWorkflow,
    WorkflowReponse,
    enregistrer_workflow,
)
from hermes.agents.orchestrateur import ConfigOrchestration, enregistrer_config
from hermes.agents.profil_metier import ProfilMetier, enregistrer_profil

PROFIL = ProfilMetier(
    activite=(
        "Korean IT services SME: development, integration and maintenance of public "
        "information systems, cloud migration, cybersecurity and AI/data platforms."
    ),
    secteurs=["Public administration", "E-government", "Smart city", "Education"],
    zone_geographique="South Korea and Asia (export through World Bank projects)",
    effectif=85,
    ca_tranche="10 - 50 M€",
    certifications=["ISO 27001", "ISO 9001", "GS certification (TTA)"],
    types_marches=["Services", "Goods"],
    references_types=[
        "Ministry information system maintenance (3 years)",
        "Cloud migration for a metropolitan city",
        "E-government platform in Viet Nam (World Bank-financed)",
    ],
)

# ≤ 10 : KONEPS pousse chaque mot-clé au serveur (au-delà, collecte non filtrée).
MOTS_CLES_INCLUS = (
    "정보시스템",
    "소프트웨어",
    "시스템 구축",
    "클라우드",
    "정보보안",
    "인공지능",
    "software",
    "information system",
    "ICT",
    "digital",
)

MOTS_CLES_EXCLUS = (
    "청소",
    "조경",
    "급식",
    "건설공사",
    "cleaning",
    "catering",
    "civil works",
    "road construction",
)

WORKFLOW = WorkflowReponse(
    source="manuel",
    consignes_globales=(
        "Concise, factual proposal draft. Reuse the tender's own terms. Keep it short: "
        "this is a first draft that a human will review before any submission."
    ),
    sections=(
        SectionWorkflow(
            titre="Understanding of the need",
            brief="Restate the buyer's objectives and constraints in a few sentences.",
            longueur_cible=150,
        ),
        SectionWorkflow(
            titre="Proposed solution and methodology",
            brief="Technical approach, phases and deliverables.",
            longueur_cible=250,
        ),
        SectionWorkflow(
            titre="Team and references",
            brief="Relevant team roles and similar past projects.",
            longueur_cible=150,
        ),
    ),
)

# Démo : peu d'AO par cycle pour que chaque agent passe vite la main au suivant.
ORCHESTRATION = ConfigOrchestration(
    actif=True, seuil_score=55.0, auto_rediger=True, max_par_cycle=3
)


@dataclass(frozen=True)
class ResumeProfilDemo:
    mots_cles_inclus: tuple[str, ...]
    mots_cles_exclus: tuple[str, ...]
    seuil_score: float
    max_par_cycle: int


def appliquer(session: Session) -> ResumeProfilDemo:
    """Écrit le profil de base dans MNEMOSYNE (idempotent : écrase les réglages)."""
    enregistrer_profil(session, PROFIL)
    enregistrer_filtre(session, FiltreVeille(inclus=MOTS_CLES_INCLUS, exclus=MOTS_CLES_EXCLUS))
    enregistrer_criteres(session, CriteresAvances())
    enregistrer_workflow(session, WORKFLOW)
    config = enregistrer_config(session, ORCHESTRATION)
    onboarding.marquer_termine(session)
    return ResumeProfilDemo(
        mots_cles_inclus=MOTS_CLES_INCLUS,
        mots_cles_exclus=MOTS_CLES_EXCLUS,
        seuil_score=config.seuil_score,
        max_par_cycle=config.max_par_cycle,
    )
