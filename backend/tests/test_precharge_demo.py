"""Préchargement de démo HERMES Korea : purge des données françaises + AO d'exemple."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from hermes import onboarding, precharge_demo
from hermes.agents.argos.filtre import charger_filtre
from hermes.agents.profil_metier import charger_profil
from hermes.db.models import (
    AnalyseKrinos,
    AppelOffre,
    BaseConnaissance,
    LogAgent,
    Parametre,
    Portail,
    ReponseHermion,
    StatutAO,
)
from hermes.db.session import get_engine


def _donnees_francaises(session: Session) -> int:
    boamp = Portail(nom="boamp", url_base="https://www.boamp.fr")
    koneps = Portail(nom="koneps", url_base="https://www.g2b.go.kr")
    session.add(boamp)
    session.add(koneps)
    session.commit()
    ao_fr = AppelOffre(
        portail_id=boamp.id,
        reference_externe="26-12345",
        url_source="https://www.boamp.fr/avis/26-12345",
        titre="Maintenance du système de messagerie SMS",
        statut=StatutAO.ANALYSE,
    )
    ao_kr = AppelOffre(
        portail_id=koneps.id,
        reference_externe="R26BK00001",
        url_source="https://www.g2b.go.kr",
        titre="정보시스템 유지보수",
    )
    session.add(ao_fr)
    session.add(ao_kr)
    session.commit()
    session.add(
        AnalyseKrinos(appel_offre_id=ao_fr.id, resume="r", score=50, justification_score="j")
    )
    session.add(ReponseHermion(appel_offre_id=ao_fr.id, contenu="Réponse"))
    session.add(BaseConnaissance(titre="Réf LinkMobility", contenu="SMS", source="doc_reference"))
    session.add(
        LogAgent(agent="ARGOS", message="Collecte boamp : 12 nouveaux", portail_id=boamp.id)
    )
    session.add(Parametre(cle="profil.metier", valeur='{"activite": "CPaaS LinkMobility"}'))
    session.commit()
    return ao_kr.id


def test_precharge_purge_le_francais_et_seme_la_demo():
    with Session(get_engine()) as session:
        id_kr = _donnees_francaises(session)
        bilan = precharge_demo.appliquer_si_necessaire(session)

        assert bilan.applique
        assert bilan.ao_supprimes == 1
        assert bilan.ao_ajoutes == len(precharge_demo.AO_DEMO)

        noms = set(session.exec(select(Portail.nom)).all())
        assert noms == {"koneps", "banque_mondiale"}
        refs = set(session.exec(select(AppelOffre.reference_externe)).all())
        assert "26-12345" not in refs
        assert session.get(AppelOffre, id_kr) is not None  # AO coréen conservé
        assert session.exec(select(BaseConnaissance)).all() == []
        assert not any("boamp" in log.message for log in session.exec(select(LogAgent)).all())

        # Profil de démo (plus de LinkMobility), filtre large, onboarding terminé.
        assert "LinkMobility" not in charger_profil(session).activite
        assert "services" in charger_filtre(session).inclus
        assert onboarding.est_termine(session)

        # AO d'exemple : en anglais, échéances futures, analyses et un brouillon HERMION.
        demo = session.exec(
            select(AppelOffre).where(AppelOffre.reference_externe.like("DEMO-%"))
        ).all()
        assert len(demo) == len(precharge_demo.AO_DEMO)
        assert not any("\uac00" <= c <= "\ud7a3" for ao in demo for c in ao.titre)
        assert sum(1 for ao in demo if ao.statut == StatutAO.BRUT) >= 2
        assert len(session.exec(select(AnalyseKrinos)).all()) >= 10
        assert len(session.exec(select(ReponseHermion)).all()) == len(precharge_demo.BROUILLONS)


def test_precharge_idempotent():
    with Session(get_engine()) as session:
        assert precharge_demo.appliquer_si_necessaire(session).applique
        second = precharge_demo.appliquer_si_necessaire(session)
        assert not second.applique
        total = len(session.exec(select(AppelOffre)).all())
        assert total == len(precharge_demo.AO_DEMO)


def test_seed_ao_correspondent_au_filtre_demo():
    """Les AO d'exemple non rejetés passent le filtre de veille du profil de démo."""
    from hermes.agents.argos.filtre import FiltreVeille

    filtre = FiltreVeille(
        inclus=precharge_demo.profil_demo.MOTS_CLES_INCLUS,
        exclus=precharge_demo.profil_demo.MOTS_CLES_EXCLUS,
    )
    for demo in precharge_demo.AO_DEMO:
        if demo.statut == StatutAO.REJETE:
            continue
        assert filtre.correspond_champs(demo.titre, demo.objet, demo.emetteur), demo.reference


def test_seed_stable_pour_le_pipeline():
    """Aucun AO d'exemple ne relance HERMION au démarrage : au-dessus du seuil ⇒ brouillon."""
    seuil = precharge_demo.profil_demo.ORCHESTRATION.seuil_score
    for demo in precharge_demo.AO_DEMO:
        assert demo.statut != StatutAO.A_REPONDRE, demo.reference
        a_brouillon = demo.reference in precharge_demo.BROUILLONS
        assert a_brouillon == (demo.statut == StatutAO.EN_REDACTION), demo.reference
        if demo.statut == StatutAO.ANALYSE:
            assert demo.analyse is not None and demo.analyse.score < seuil, demo.reference


def test_lancement_applique_le_precharge(monkeypatch):
    from hermes.config import settings
    from hermes.main import app

    monkeypatch.setattr(settings, "demo_precharge", True)
    with TestClient(app) as client:
        r = client.get("/appels-offre")
        assert r.status_code == 200
    with Session(get_engine()) as session:
        assert precharge_demo.est_applique(session)
