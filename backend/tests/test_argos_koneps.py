"""Tests du scraper KONEPS (나라장터) — réponses data.go.kr simulées."""

from __future__ import annotations

import json
from datetime import UTC, datetime

import httpx
import pytest

from hermes.agents.argos import koneps
from hermes.agents.argos.base import CriteresAvances
from hermes.agents.argos.filtre import FiltreVeille
from hermes.agents.argos.koneps import (
    ErreurKoneps,
    KonepsScraper,
    item_vers_ao,
    lire_reponse,
    parse_date_kst,
)

ITEM = {
    "bidNtceNo": "R26BK01234567",
    "bidNtceOrd": "000",
    "bidNtceNm": "2026년 정보시스템 유지보수 용역",
    "ntceInsttNm": "조달청 서울지방조달청",
    "dminsttNm": "서울특별시",
    "bidMethdNm": "전자입찰",
    "cntrctCnclsMthdNm": "제한경쟁",
    "bidNtceDt": "2026-10-27 10:00:00",
    "bidClseDt": "2026-11-05 18:00:00",
    "opengDt": "2026-11-06 11:00:00",
    "asignBdgtAmt": "150000000",
    "presmptPrce": "136363636",
    "bidNtceDtlUrl": "https://www.g2b.go.kr/link/R26BK01234567",
    "ntceSpecDocUrl1": "https://www.g2b.go.kr/files/spec1.hwp",
    "ntceSpecDocUrl2": "",
}


def _reponse(items, total=None):
    return json.dumps(
        {
            "response": {
                "header": {"resultCode": "00", "resultMsg": "정상"},
                "body": {
                    "items": items,
                    "numOfRows": 100,
                    "pageNo": 1,
                    "totalCount": len(items) if total is None else total,
                },
            }
        },
        ensure_ascii=False,
    )


def test_item_vers_ao_mappe_les_champs():
    ao = item_vers_ao(ITEM, "Services")
    assert ao is not None
    assert ao.reference_externe == "R26BK01234567-000"
    assert ao.titre == "2026년 정보시스템 유지보수 용역"
    assert ao.emetteur == "조달청 서울지방조달청"
    assert "Demand agency: 서울특별시" in (ao.objet or "")
    assert ao.budget_estime == 150_000_000
    assert ao.devise == "KRW"
    assert ao.type_marche == "Services"
    assert ao.zone_geographique == "KOR"
    assert ao.url_source == "https://www.g2b.go.kr/link/R26BK01234567"
    assert ao.liens_documents == ["https://www.g2b.go.kr/files/spec1.hwp"]
    # Heure de Séoul (UTC+9) convertie en UTC.
    assert ao.date_publication == datetime(2026, 10, 27, 1, 0, tzinfo=UTC)
    assert ao.date_limite == datetime(2026, 11, 5, 9, 0, tzinfo=UTC)


def test_item_sans_numero_ou_titre_ignore():
    assert item_vers_ao({"bidNtceNm": "x"}) is None
    assert item_vers_ao({"bidNtceNo": "1"}) is None


def test_item_sans_url_detail_a_une_url_unique():
    item = {**ITEM, "bidNtceDtlUrl": "", "asignBdgtAmt": "", "presmptPrce": "0"}
    ao = item_vers_ao(item)
    assert "R26BK01234567" in ao.url_source and "000" in ao.url_source
    assert ao.budget_estime is None


def test_parse_date_kst_formats():
    assert parse_date_kst("2026-10-27 09:00") == datetime(2026, 10, 27, 0, 0, tzinfo=UTC)
    assert parse_date_kst("20261027") == datetime(2026, 10, 26, 15, 0, tzinfo=UTC)
    assert parse_date_kst("") is None
    assert parse_date_kst("n/a") is None


@pytest.mark.parametrize(
    "items",
    [[ITEM], {"item": [ITEM]}, {"item": ITEM}],
)
def test_lire_reponse_formes_items(items):
    lus, total = lire_reponse(_reponse(items, total=1))
    assert lus == [ITEM]
    assert total == 1


def test_lire_reponse_vide():
    assert lire_reponse(_reponse("", total=0)) == ([], 0)


def test_lire_reponse_cle_refusee_xml():
    xml = (
        "<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg>"
        "<returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg>"
        "</cmmMsgHeader></OpenAPI_ServiceResponse>"
    )
    with pytest.raises(ErreurKoneps, match="SERVICE"):
        lire_reponse(xml)


def test_lire_reponse_code_erreur():
    corps = json.dumps({"response": {"header": {"resultCode": "07", "resultMsg": "bad"}}})
    with pytest.raises(ErreurKoneps, match="07"):
        lire_reponse(corps)


@pytest.mark.asyncio
async def test_collecte_sans_cle_explique_quoi_faire(monkeypatch):
    monkeypatch.delenv("HERMES_KONEPS_SERVICE_KEY", raising=False)
    with pytest.raises(ErreurKoneps, match="data.go.kr"):
        await KonepsScraper().collecter()


def _installer_transport(monkeypatch, handler):
    vrai_client = httpx.AsyncClient

    def client(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return vrai_client(*args, **kwargs)

    monkeypatch.setattr(koneps.httpx, "AsyncClient", client)


@pytest.mark.asyncio
async def test_collecte_une_requete_par_nature_et_mot_cle(monkeypatch):
    requetes: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requetes.append(request)
        terme = request.url.params.get("bidNtceNm")
        item = {**ITEM, "bidNtceNo": f"R{len(requetes)}", "bidNtceNm": f"{terme} 용역"}
        return httpx.Response(200, text=_reponse([item, ITEM]))

    _installer_transport(monkeypatch, handler)
    s = KonepsScraper()
    s.credentials = {"service_key": "CLE"}
    s.filtre_inclus = ("유지보수", "보안")
    s.criteres = CriteresAvances(natures=("services", "fournitures"))
    s.maintenant = lambda: datetime(2026, 10, 27, 0, 0, tzinfo=UTC)

    aos = await s.collecter()

    operations = {r.url.path.rsplit("/", 1)[-1] for r in requetes}
    assert operations == {
        "getBidPblancListInfoServcPPSSrch",
        "getBidPblancListInfoThngPPSSrch",
    }
    assert {r.url.params["bidNtceNm"] for r in requetes} == {"유지보수", "보안"}
    assert len(requetes) == 4
    p = requetes[0].url.params
    assert p["serviceKey"] == "CLE"
    assert p["inqryDiv"] == "1"
    # Fenêtre initiale de 7 jours, en heure de Séoul.
    assert p["inqryBgnDt"] == "202610200900"
    assert p["inqryEndDt"] == "202610270900"
    # ITEM revient à chaque requête mais n'est gardé qu'une fois.
    assert len(aos) == 5


@pytest.mark.asyncio
async def test_collecte_incrementale_et_pagination(monkeypatch):
    pages: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        page = request.url.params["pageNo"]
        pages.append(page)
        items = [{**ITEM, "bidNtceNo": f"P{page}-{i}"} for i in range(100 if page == "1" else 5)]
        return httpx.Response(200, text=_reponse(items, total=105))

    _installer_transport(monkeypatch, handler)
    s = KonepsScraper()
    s.credentials = {"service_key": "CLE"}
    s.criteres = CriteresAvances(natures=("travaux",))
    s.maintenant = lambda: datetime(2026, 10, 27, 0, 0, tzinfo=UTC)
    s.depuis = datetime(2026, 10, 26, 0, 0, tzinfo=UTC)

    aos = await s.collecter()

    assert pages == ["1", "2"]
    assert len(aos) == 105
    assert not s.collecte_partielle


def test_filtre_mots_cles_coreens():
    filtre = FiltreVeille(inclus=("유지보수", "SI"), exclus=("청소",))
    ao = item_vers_ao(ITEM)
    assert filtre.correspond(ao)
    # Le hangul est comparé par syllabes entières : décomposé en jamos,
    # « 용여 » serait un préfixe de « 용역 » (ㅇㅕ ⊂ ㅇㅕㄱ) et matcherait à tort.
    assert not FiltreVeille(inclus=("용여",)).correspond(ao)
    nettoyage = item_vers_ao({**ITEM, "bidNtceNm": "청사 청소 용역"})
    assert not filtre.correspond(nettoyage)
