"""Gemini en priorité (profil démo) : moteur, repli local, persistance chiffrée, démo."""

from __future__ import annotations

import json
from datetime import UTC

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from hermes.agents import pythia
from hermes.config import settings
from hermes.db.models import Parametre
from hermes.db.session import get_engine

CLE = "AQ.cle-de-test-123"


@pytest.fixture(autouse=True)
def _gemini_isole(monkeypatch):
    monkeypatch.setattr(settings, "gemini_actif", False)
    monkeypatch.setattr(settings, "gemini_api_key", "")
    monkeypatch.setattr(settings, "gemini_cle_env", False)
    monkeypatch.setattr(settings, "gemini_modele", "gemini-3.5-flash")
    monkeypatch.setattr(settings, "pythia_moteur", "ollama")


def _transport(monkeypatch, handler):
    vrai_client = httpx.AsyncClient

    def client(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return vrai_client(*args, **kwargs)

    monkeypatch.setattr(pythia.httpx, "AsyncClient", client)


def _reponse_gemini(texte: str) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "choices": [{"message": {"content": texte}}],
            "usage": {"prompt_tokens": 12, "completion_tokens": 5},
        },
    )


def test_moteur_local_par_defaut():
    assert isinstance(pythia.moteur_actif(), pythia.MoteurOllama)


def test_gemini_sans_cle_reste_local(monkeypatch):
    monkeypatch.setattr(settings, "gemini_actif", True)
    assert isinstance(pythia.moteur_actif(), pythia.MoteurOllama)


def test_payload_gemini():
    settings.gemini_modele = "gemini-3.5-flash"
    r = pythia.RequetePythia(
        prompt="p", system="s", format_schema={"type": "object"}, raisonnement=False
    )
    payload = pythia.MoteurGemini().construire_payload(r)
    assert payload["model"] == "gemini-3.5-flash"
    assert payload["reasoning_effort"] == "none"
    assert payload["response_format"]["type"] == "json_schema"
    assert "chat_template_kwargs" not in payload


async def test_gemini_prioritaire(monkeypatch):
    monkeypatch.setattr(settings, "gemini_actif", True)
    monkeypatch.setattr(settings, "gemini_api_key", CLE)
    requetes: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requetes.append(request)
        return _reponse_gemini('{"ok": true}')

    _transport(monkeypatch, handler)
    rep = await pythia.generer("Bonjour", format_json=True)

    assert rep.texte == '{"ok": true}'
    assert rep.modele == "gemini-3.5-flash"
    assert len(requetes) == 1
    assert requetes[0].url.host == "generativelanguage.googleapis.com"
    assert requetes[0].headers["Authorization"] == f"Bearer {CLE}"


async def test_gemini_reessaie_une_fois_sur_503(monkeypatch):
    monkeypatch.setattr(settings, "gemini_actif", True)
    monkeypatch.setattr(settings, "gemini_api_key", CLE)
    monkeypatch.setattr(pythia.asyncio, "sleep", _sans_attente)
    appels: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        appels.append(1)
        if len(appels) == 1:
            return httpx.Response(503, json=[{"error": {"code": 503}}])
        return _reponse_gemini("ok")

    _transport(monkeypatch, handler)
    rep = await pythia.generer("x")
    assert rep.texte == "ok"
    assert len(appels) == 2


async def _sans_attente(_delai: float) -> None:
    return None


async def test_repli_local_si_gemini_echoue(monkeypatch):
    monkeypatch.setattr(settings, "gemini_actif", True)
    monkeypatch.setattr(settings, "gemini_api_key", CLE)
    hotes: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        hotes.append(request.url.host)
        if request.url.host == "generativelanguage.googleapis.com":
            return httpx.Response(400, json=[{"error": {"message": "API key not valid"}}])
        return httpx.Response(200, json={"response": "réponse locale"})

    _transport(monkeypatch, handler)
    rep = await pythia.generer("x")

    assert rep.texte == "réponse locale"
    assert hotes == ["generativelanguage.googleapis.com", "127.0.0.1"]


async def test_gemini_429_reessais_espaces(monkeypatch):
    """Quota par minute (429, offre gratuite) : plusieurs réessais espacés."""
    monkeypatch.setattr(settings, "gemini_actif", True)
    monkeypatch.setattr(settings, "gemini_api_key", CLE)
    attentes: list[float] = []

    async def noter(delai: float) -> None:
        attentes.append(delai)

    monkeypatch.setattr(pythia.asyncio, "sleep", noter)
    appels: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        appels.append(1)
        if len(appels) <= 3:
            return httpx.Response(429, json=[{"error": {"code": 429}}])
        return _reponse_gemini("ok")

    _transport(monkeypatch, handler)
    rep = await pythia.generer("x")
    assert rep.texte == "ok"
    assert attentes == list(pythia._GEMINI_ATTENTES_RETRY)


async def test_double_echec_remonte_la_cause_gemini(monkeypatch):
    """Gemini puis repli local en échec : le message garde l'erreur Gemini."""
    monkeypatch.setattr(settings, "gemini_actif", True)
    monkeypatch.setattr(settings, "gemini_api_key", CLE)

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "generativelanguage.googleapis.com":
            return httpx.Response(400, json=[{"error": {"message": "API key not valid"}}])
        return httpx.Response(404, json={"error": "model 'qwen3:8b' not found"})

    _transport(monkeypatch, handler)
    with pytest.raises(pythia.ErreurPythia) as exc:
        await pythia.generer("x")
    message = str(exc.value)
    assert message.startswith("gemini failed:")
    assert "400" in message and "local fallback ollama failed" in message


async def test_budget_quotidien_bascule_sur_le_local(monkeypatch, tmp_path):
    """Budget du jour consommé : plus d'appel Gemini, repli local direct."""
    monkeypatch.setattr(settings, "gemini_actif", True)
    monkeypatch.setattr(settings, "gemini_api_key", CLE)
    monkeypatch.setattr(settings, "gemini_quota_jour", 2)
    monkeypatch.setattr(settings, "db_path", tmp_path / "h.db")
    hotes: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        hotes.append(request.url.host)
        if request.url.host == "generativelanguage.googleapis.com":
            return _reponse_gemini("gemini")
        return httpx.Response(200, json={"response": "local"})

    _transport(monkeypatch, handler)
    textes = [(await pythia.generer("x")).texte for _ in range(3)]

    assert textes == ["gemini", "gemini", "local"]
    assert hotes.count("generativelanguage.googleapis.com") == 2
    assert pythia.quota_gemini.appels_du_jour() == 2
    assert pythia.quota_gemini.epuise()


def test_jour_pacifique():
    from datetime import datetime as dt

    # 23/11 22h à Séoul = 23/11 05h à Los Angeles ; 24/11 16h59 Séoul = 23/11 23h59 LA.
    assert pythia._jour_pacifique(dt(2026, 11, 23, 13, 0, tzinfo=UTC)) == "2026-11-23"
    assert pythia._jour_pacifique(dt(2026, 11, 24, 7, 59, tzinfo=UTC)) == "2026-11-23"
    assert pythia._jour_pacifique(dt(2026, 11, 24, 8, 0, tzinfo=UTC)) == "2026-11-24"


async def test_juge_local_n_appelle_jamais_gemini(monkeypatch):
    from hermes.agents.krinos import juge_local

    monkeypatch.setattr(settings, "gemini_actif", True)
    monkeypatch.setattr(settings, "gemini_api_key", CLE)
    hotes: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        hotes.append(request.url.host)
        return httpx.Response(
            200, json={"response": '{"manipulation": false, "passage": ""}'}
        )

    _transport(monkeypatch, handler)
    await juge_local.juger("Titre", "Objet", "")
    assert hotes and "generativelanguage.googleapis.com" not in hotes


def test_route_gemini_chiffre_la_cle():
    from hermes.main import app

    with TestClient(app) as client:
        assert client.get("/pythia/gemini").json()["cle_configuree"] is False
        r = client.put("/pythia/gemini", json={"actif": True, "cle": CLE})
        assert r.status_code == 200
        data = r.json()
        assert data == {
            "actif": True,
            "modele": "gemini-3.5-flash",
            "cle_configuree": True,
            "cle_depuis_env": False,
        }
        # Statut PYTHIA prêt même sans Ollama.
        assert client.get("/pythia/modele/status").json()["installe"] is True

    with Session(get_engine()) as session:
        brut = session.get(Parametre, "pythia.gemini").valeur
    assert CLE not in brut
    assert json.loads(brut)["actif"] is True

    # Effacement de la clé.
    with TestClient(app) as client:
        data = client.put("/pythia/gemini", json={"actif": True, "effacer_cle": True}).json()
    assert data["cle_configuree"] is False
    assert not pythia.gemini_pret()


def test_gemini_persiste_au_redemarrage():
    from hermes.api import pythia as pythia_api

    with Session(get_engine()) as session:
        pythia_api.enregistrer_gemini(session, actif=True, cle=CLE, modele="gemini-3.6-flash")
    settings.gemini_actif = False
    settings.gemini_api_key = ""
    with Session(get_engine()) as session:
        pythia_api.appliquer_gemini_persiste(session)
    assert settings.gemini_actif is True
    assert settings.gemini_api_key == CLE
    assert settings.gemini_modele == "gemini-3.6-flash"


def test_profil_demo():
    from hermes.main import app

    with TestClient(app) as client:
        r = client.post("/profil/demo", json={"gemini_cle": CLE})
        assert r.status_code == 200
        data = r.json()
        assert data["gemini_actif"] is True
        assert len(data["mots_cles_inclus"]) <= 10
        assert data["max_par_cycle"] == 3

        filtre = client.get("/argos/filtre").json()
        assert filtre["inclus"] == data["mots_cles_inclus"]
        assert client.get("/profil/metier").json()["activite"].startswith("Korean IT")
        assert client.get("/orchestration/config").json()["seuil_score"] == 80.0
        assert len(client.get("/hermion/workflow").json()["sections"]) == 3

    from hermes import onboarding

    with Session(get_engine()) as session:
        assert onboarding.est_termine(session)


async def test_etat_pipeline_signale_l_agent_au_travail(monkeypatch):
    from hermes.agents import orchestrateur
    from hermes.db.models import AppelOffre, StatutAO

    vus: list[object] = []

    async def fausse_analyse(session, ao):
        vus.append(orchestrateur.etape_en_cours())
        raise orchestrateur.ErreurAnalyseKrinos("stop")

    async def sans_docs(session, ao):
        return None

    monkeypatch.setattr(orchestrateur, "analyser_ao", fausse_analyse)
    monkeypatch.setattr(orchestrateur, "_documents_best_effort", sans_docs)
    with Session(get_engine()) as session:
        session.add(AppelOffre(titre="AO démo", url_source="https://x/1", statut=StatutAO.BRUT))
        session.commit()
        await orchestrateur.traiter_pipeline(session)

    assert vus and vus[0]["agent"] == "KRINOS" and vus[0]["titre"] == "AO démo"
    assert orchestrateur.etape_en_cours() is None
