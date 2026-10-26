"""Workflow de rédaction HERMION — structure de réponse persistée en MNEMOSYNE.

Le workflow décrit comment HERMION doit articuler une réponse : une liste
ordonnée de sections (titre + brief) plus des consignes globales (ton, style,
mentions obligatoires). Il est stocké dans la table `parametres` (clé/valeur
JSON sous la clé `hermion.workflow`), même pattern que `argos.filtre` et
`krinos.ponderation_scoring`.

Origine du workflow :
- ``ia_workflow``  : dérivé par PYTHIA d'un workflow décrit en texte libre.
- ``ia_exemples``  : dérivé par PYTHIA de réponses/AO déjà remplis fournis
  par l'utilisateur.
- ``manuel``       : saisi ou corrigé à la main par l'utilisateur.

Quand aucun workflow n'est configuré, `charger_workflow` retourne ``None`` et
HERMION retombe sur la génération de plan dynamique (`writer._generer_plan`).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlmodel import Session

from hermes.agents import pythia
from hermes.config import settings
from hermes.db.models import Parametre

CLE_PARAMETRE = "hermion.workflow"

# Garde-fous : un workflow exploitable, ni vide ni délirant.
MAX_SECTIONS = 12
MIN_LONGUEUR_CIBLE = 50
MAX_LONGUEUR_CIBLE = 1500

SOURCES_VALIDES = frozenset({"ia_workflow", "ia_exemples", "manuel"})


@dataclass(frozen=True)
class SectionWorkflow:
    """Une section imposée à HERMION dans l'ordre du document."""

    titre: str
    brief: str = ""
    # Longueur indicative en mots (None = laisser HERMION décider).
    longueur_cible: int | None = None

    def en_dict(self) -> dict[str, object]:
        return {
            "titre": self.titre,
            "brief": self.brief,
            "longueur_cible": self.longueur_cible,
        }


@dataclass(frozen=True)
class WorkflowReponse:
    """Cadre de rédaction complet consommé par le writer HERMION."""

    sections: tuple[SectionWorkflow, ...] = field(default_factory=tuple)
    consignes_globales: str = ""
    source: str = "manuel"

    @property
    def configure(self) -> bool:
        return bool(self.sections)

    def en_dict(self) -> dict[str, object]:
        return {
            "source": self.source,
            "consignes_globales": self.consignes_globales,
            "sections": [s.en_dict() for s in self.sections],
        }


# --------------------------------------------------------------------------- #
# Persistance MNEMOSYNE
# --------------------------------------------------------------------------- #


def charger_workflow(session: Session) -> WorkflowReponse | None:
    """Charge le workflow depuis MNEMOSYNE.

    Retourne ``None`` si rien n'est configuré (ou config illisible / sans
    section) — HERMION retombe alors sur le plan dynamique.
    """
    entree = session.get(Parametre, CLE_PARAMETRE)
    if entree is None or not entree.valeur:
        return None
    try:
        data = json.loads(entree.valeur)
    except json.JSONDecodeError:
        return None
    workflow = _workflow_depuis_dict(data)
    return workflow if workflow.configure else None


def enregistrer_workflow(
    session: Session, workflow: WorkflowReponse
) -> WorkflowReponse:
    """Persiste le workflow (création ou mise à jour). Normalise les sections."""
    nettoye = _normaliser(workflow)
    payload = json.dumps(nettoye.en_dict(), ensure_ascii=False)
    entree = session.get(Parametre, CLE_PARAMETRE)
    if entree is None:
        entree = Parametre(
            cle=CLE_PARAMETRE,
            valeur=payload,
            description="HERMION drafting workflow — sections + instructions (JSON)",
        )
    else:
        entree.valeur = payload
        entree.maj_le = datetime.now(UTC)
    session.add(entree)
    session.commit()
    return nettoye


# --------------------------------------------------------------------------- #
# Dérivation IA (PYTHIA)
# --------------------------------------------------------------------------- #


def _system_prompt_derivation() -> str:
    return (
        "You are HERMION, an expert in responding to public tenders. You analyse "
        "how a company structures its responses and extract a reusable drafting "
        "workflow from it: an ordered list of sections, each with a short title "
        f"in {settings.pythia_langue_sortie} and a brief describing what it must "
        "contain. You output ONLY a valid JSON object."
    )


async def deriver_workflow(*, mode: str, contenu: str) -> WorkflowReponse:
    """Demande à PYTHIA de dériver un workflow.

    ``mode`` vaut ``"workflow"`` (l'utilisateur décrit son processus en texte
    libre) ou ``"exemples"`` (l'utilisateur colle des réponses / AO déjà
    remplis dont on infère la trame).

    Lève `pythia.ErreurPythia` si l'entrée est vide ou la sortie inexploitable.
    """
    texte = (contenu or "").strip()
    if not texte:
        raise pythia.ErreurPythia(
            "Empty content — provide a workflow or example responses."
        )

    if mode == "exemples":
        source = "ia_exemples"
        consigne_mode = (
            "Below are one or more tender responses already written by the user. "
            "Infer the common reusable outline from them (the recurring sections, "
            "their order, their role)."
        )
    else:
        source = "ia_workflow"
        consigne_mode = (
            "Below is the user's free-form description of how they want to "
            "structure their responses. Turn it into a workflow."
        )

    langue = settings.pythia_langue_sortie
    prompt = (
        f"{consigne_mode}\n"
        "\n"
        "Answer in strict JSON, with no surrounding text, in the form:\n"
        '  {"sections": [{"titre": "...", "brief": "...", '
        '"longueur_cible": 300}], "consignes_globales": "..."}\n'
        "\n"
        "Rules:\n"
        f"  - Between 3 and {MAX_SECTIONS} sections, in document order.\n"
        f"  - 'titre': 3 to 8 words, in {langue}, no numbering.\n"
        f"  - 'brief': 1 to 3 sentences in {langue} describing the expected content.\n"
        "  - 'longueur_cible': integer (words) or null if not relevant.\n"
        "  - 'consignes_globales': tone, style, mandatory statements shared by "
        "all sections (string, possibly empty).\n"
        "\n"
        "=== USER INPUT ===\n"
        f"{texte}\n"
        "=== END OF INPUT ==="
    )

    reponse = await pythia.generer(
        prompt, system=_system_prompt_derivation(), format_json=True
    )
    payload = pythia.parser_json_sortie(reponse.texte)
    if not isinstance(payload, dict):
        raise pythia.ErreurPythia("PYTHIA response is not a JSON object")

    workflow = _workflow_depuis_dict(payload, source=source)
    if not workflow.configure:
        raise pythia.ErreurPythia(
            "PYTHIA returned no usable section."
        )
    return _normaliser(workflow)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _workflow_depuis_dict(
    data: object, *, source: str | None = None
) -> WorkflowReponse:
    if not isinstance(data, dict):
        return WorkflowReponse(source=source or "manuel")

    sections: list[SectionWorkflow] = []
    for item in data.get("sections", []) or []:
        if not isinstance(item, dict):
            continue
        titre = str(item.get("titre") or "").strip()
        if not titre:
            continue
        brief = str(item.get("brief") or "").strip()
        sections.append(
            SectionWorkflow(
                titre=titre,
                brief=brief,
                longueur_cible=_longueur_valide(item.get("longueur_cible")),
            )
        )

    consignes = str(data.get("consignes_globales") or "").strip()
    src = source or str(data.get("source") or "manuel").strip() or "manuel"
    if src not in SOURCES_VALIDES:
        src = "manuel"
    return WorkflowReponse(
        sections=tuple(sections),
        consignes_globales=consignes,
        source=src,
    )


def _normaliser(workflow: WorkflowReponse) -> WorkflowReponse:
    propres: list[SectionWorkflow] = []
    for section in workflow.sections:
        titre = section.titre.strip()
        if not titre:
            continue
        propres.append(
            SectionWorkflow(
                titre=titre,
                brief=section.brief.strip(),
                longueur_cible=_longueur_valide(section.longueur_cible),
            )
        )
        if len(propres) >= MAX_SECTIONS:
            break
    src = workflow.source if workflow.source in SOURCES_VALIDES else "manuel"
    return WorkflowReponse(
        sections=tuple(propres),
        consignes_globales=workflow.consignes_globales.strip(),
        source=src,
    )


def _longueur_valide(valeur: object) -> int | None:
    if valeur is None:
        return None
    try:
        n = int(valeur)
    except (TypeError, ValueError):
        return None
    if n <= 0:
        return None
    return max(MIN_LONGUEUR_CIBLE, min(MAX_LONGUEUR_CIBLE, n))
