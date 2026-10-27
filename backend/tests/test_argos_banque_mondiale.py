"""Tests du scraper Banque mondiale (avis des projets en Asie) — API simulée."""

from __future__ import annotations

from datetime import UTC, datetime

import httpx

from hermes.agents.argos import banque_mondiale
from hermes.agents.argos.banque_mondiale import (
    PAYS_ASIE,
    BanqueMondialeScraper,
    avis_vers_ao,
    est_appel,
    extraire_avis,
)
from hermes.agents.argos.base import TAILLE_PAGE, CriteresAvances

AVIS = {
    "id": "OP00412345",
    "notice_type": "Invitation for Bids",
    "notice_status": "Published",
    "noticedate": "20-Oct-2026",
    "submission_date": "2026-10-20T00:00:00Z",
    "submission_deadline_date": "2026-11-25T00:00:00Z",
    "submission_deadline_time": "14:00",
    "project_ctry_code": "VN",
    "project_ctry_name": "Viet Nam",
    "project_id": "P176543",
    "project_name": "Digital Transformation of Public Services",
    "bid_reference_no": "VN-MIC-123456-GO-RFB",
    "bid_description": "Supply and installation of data center equipment",
    "procurement_group_desc": "Goods",
    "procurement_method_name": "Request for Bids",
    "bid_estimate_amount": "2500000",
    "bid_currency_code": "USD",
    "agency_name": "Ministry of Information and Communications",
}


def test_avis_vers_ao():
    ao = avis_vers_ao(AVIS)
    assert ao is not None
    assert ao.reference_externe == "OP00412345"
    assert ao.titre == "Supply and installation of data center equipment"
    assert ao.url_source.endswith("/procurement-detail/OP00412345")
    assert ao.emetteur == "Ministry of Information and Communications"
    assert "Project: Digital Transformation of Public Services (P176543)" in ao.objet
    assert ao.budget_estime == 2_500_000
    assert ao.devise == "USD"
    assert ao.zone_geographique == "VN"
    assert ao.type_marche == "Invitation for Bids"
    assert ao.date_publication == datetime(2026, 10, 20, tzinfo=UTC)
    assert ao.date_limite == datetime(2026, 11, 25, tzinfo=UTC)


def test_avis_minimal_et_repli_date():
    ao = avis_vers_ao(
        {"id": "OP1", "project_name": "Road project", "noticedate": "07-Oct-2026"}
    )
    assert ao.titre == "Road project"
    assert ao.date_publication == datetime(2026, 10, 7, tzinfo=UTC)
    assert ao.devise == "USD"
    assert avis_vers_ao({"id": "OP2"}) is None


def test_attributions_et_brouillons_ecartes():
    assert est_appel(AVIS)
    assert est_appel({**AVIS, "notice_type": "Request for Expression of Interest"})
    assert not est_appel({**AVIS, "notice_type": "Contract Award"})
    assert not est_appel({**AVIS, "notice_status": "Draft"})


def test_extraire_avis_formes():
    assert extraire_avis({"procnotices": [AVIS]}) == [AVIS]
    assert extraire_avis({"procnotices": {"OP00412345": AVIS}}) == [AVIS]
    assert extraire_avis({"total": 0}) == []
    assert extraire_avis([]) == []


def _installer_transport(monkeypatch, handler):
    vrai_client = httpx.AsyncClient

    def client(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return vrai_client(*args, **kwargs)

    monkeypatch.setattr(banque_mondiale.httpx, "AsyncClient", client)


async def test_collecte_pays_asie_par_defaut(monkeypatch):
    requetes: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requetes.append(request)
        award = {**AVIS, "id": "OP9", "notice_type": "Contract Award"}
        return httpx.Response(200, json={"total": 2, "procnotices": [AVIS, award]})

    _installer_transport(monkeypatch, handler)
    aos = await BanqueMondialeScraper().collecter()

    assert [a.reference_externe for a in aos] == ["OP00412345"]
    params = requetes[0].url.params
    assert params["project_ctry_code_exact"].split("^") == list(PAYS_ASIE.values())
    assert params["srt"] == "submission_date"
    assert params["order"] == "desc"


async def test_collecte_pays_choisis_et_borne_incrementale(monkeypatch):
    offsets: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        offsets.append(request.url.params["os"])
        page = [
            {**AVIS, "id": f"OP{request.url.params['os']}-{i}"} for i in range(TAILLE_PAGE)
        ]
        return httpx.Response(200, json={"procnotices": page})

    _installer_transport(monkeypatch, handler)
    s = BanqueMondialeScraper()
    s.criteres = CriteresAvances(pays=("VNM", "IDN", "FRA"))
    # Dernière collecte récente : la 1re page (publiée le 20/10) est déjà
    # antérieure à la borne, inutile de paginer plus loin.
    s.depuis = datetime(2026, 10, 26, tzinfo=UTC)

    aos = await s.collecter()

    assert offsets == ["0"]
    assert len(aos) == TAILLE_PAGE


async def test_collecte_pays_filtre_iso3(monkeypatch):
    vus: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        vus.append(request.url.params["project_ctry_code_exact"])
        return httpx.Response(200, json={"procnotices": []})

    _installer_transport(monkeypatch, handler)
    s = BanqueMondialeScraper()
    s.criteres = CriteresAvances(pays=("VNM", "IDN", "FRA"))
    await s.collecter()
    # FRA n'est pas un pays d'Asie couvert : ignoré.
    assert vus == ["VN^ID"]
