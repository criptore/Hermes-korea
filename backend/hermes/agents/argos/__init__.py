"""ARGOS — agent de collecte / scraping des portails AO.

Architecture :
- `base.py`      : interface `Scraper` que chaque portail implémente.
- `koneps.py`    : KONEPS / 나라장터 (marchés publics coréens, OpenAPI data.go.kr).
- `banque_mondiale.py` : avis Banque mondiale des projets en Asie (API publique).
- `boamp.py`, `ted.py` : portails français historiques, plus enregistrés.
- `playwright_auth.py` : base pour les portails privés avec authentification.
- `runner.py`    : exécution d'un scraper, persistance MNEMOSYNE, gestion logs.
- `scheduler.py` : APScheduler — planification automatique des collectes.

Le nom ARGOS renvoie à Argos Panoptès, le géant aux cent yeux de la mythologie
grecque. Surveille tout, ne dort jamais (ou presque — APScheduler gère).
"""

from hermes.agents.argos.base import (  # noqa: F401
    AOCollecte,
    ResultatCollecte,
    Scraper,
)
from hermes.agents.argos.runner import executer_collecte  # noqa: F401
