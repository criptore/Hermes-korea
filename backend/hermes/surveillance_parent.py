"""Arrêt du backend quand l'application desktop HERMES disparaît (macOS / Linux).

Sous Windows, un Job Object « kill-on-close » tue backend et Ollama si hermes.exe
meurt brutalement. macOS et Linux n'ont pas d'équivalent simple : l'app Tauri
transmet donc son PID (`HERMES_PARENT_PID`) et, s'il l'a lancé lui-même, celui
d'Ollama/PYTHIA (`HERMES_OLLAMA_PID`). Un thread démon vérifie que le parent vit
encore ; sinon il arrête l'Ollama orphelin puis le backend (SIGTERM, arrêt propre
d'uvicorn, puis sortie forcée si rien ne bouge).

Inactif sans `HERMES_PARENT_PID` (dev, tests, lancement manuel) et sous Windows.
"""

from __future__ import annotations

import os
import signal
import threading
import time
from collections.abc import Callable

from loguru import logger

INTERVALLE_SECONDES = 2.0
DELAI_SORTIE_FORCEE_SECONDES = 10.0


def _pid_env(nom: str) -> int | None:
    try:
        pid = int(os.environ.get(nom, ""))
    except ValueError:
        return None
    return pid if pid > 1 else None


def _pid_vivant(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def parent_vivant_fn(parent: int) -> Callable[[], bool]:
    """Test de vie du parent. Si le backend est bien son enfant direct, on compare
    `getppid()` (insensible à la réutilisation de PID) ; sinon on sonde le PID."""
    if os.getppid() == parent:
        return lambda: os.getppid() == parent
    return lambda: _pid_vivant(parent)


def surveiller(
    parent_vivant: Callable[[], bool],
    arreter: Callable[[], None],
    intervalle: float = INTERVALLE_SECONDES,
    attendre: Callable[[float], None] = time.sleep,
) -> None:
    """Boucle bloquante : appelle `arreter()` dès que le parent a disparu."""
    while parent_vivant():
        attendre(intervalle)
    arreter()


def _arreter(ollama: int | None) -> None:
    logger.warning("HERMES desktop app is gone: stopping the backend")
    if ollama is not None and _pid_vivant(ollama):
        try:
            os.kill(ollama, signal.SIGTERM)
        except OSError as exc:
            logger.warning("Could not stop the orphaned Ollama/PYTHIA ({})", exc)
    # Filet : si uvicorn ne s'arrête pas proprement, sortie forcée.
    minuteur = threading.Timer(DELAI_SORTIE_FORCEE_SECONDES, os._exit, args=(0,))
    minuteur.daemon = True
    minuteur.start()
    os.kill(os.getpid(), signal.SIGTERM)


def demarrer() -> threading.Thread | None:
    """Lance la surveillance si l'app desktop l'a demandée (macOS / Linux)."""
    if os.name == "nt":
        return None
    parent = _pid_env("HERMES_PARENT_PID")
    if parent is None:
        return None
    ollama = _pid_env("HERMES_OLLAMA_PID")
    fil = threading.Thread(
        target=surveiller,
        args=(parent_vivant_fn(parent), lambda: _arreter(ollama)),
        name="hermes-surveillance-parent",
        daemon=True,
    )
    fil.start()
    logger.info("Watching the HERMES desktop app (PID {})", parent)
    return fil
