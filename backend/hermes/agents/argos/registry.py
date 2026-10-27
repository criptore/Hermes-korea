"""Registre des scrapers disponibles, indexés par nom court de portail."""

from __future__ import annotations

from hermes.agents.argos.banque_mondiale import BanqueMondialeScraper
from hermes.agents.argos.base import Scraper
from hermes.agents.argos.koneps import KonepsScraper

# Pour ajouter un portail : implémenter `Scraper` dans un nouveau fichier
# puis l'enregistrer ici. Aucun import dynamique → exigence sécurité (pas de
# chargement de code basé sur des données BDD).
# Cible : commercial coréen — marchés publics coréens (KONEPS / 나라장터) et
# projets financés par la Banque mondiale en Asie. Les scrapers français
# (BOAMP, TED) ne sont plus enregistrés.
_REGISTRE: dict[str, type[Scraper]] = {
    KonepsScraper.nom: KonepsScraper,
    BanqueMondialeScraper.nom: BanqueMondialeScraper,
}


def scrapers_disponibles() -> list[str]:
    return sorted(_REGISTRE.keys())


def creer_scraper(nom: str) -> Scraper:
    if nom not in _REGISTRE:
        raise KeyError(
            f"Scraper inconnu : {nom!r}. Disponibles : {scrapers_disponibles()}"
        )
    return _REGISTRE[nom]()
