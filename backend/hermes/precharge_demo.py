"""Préchargement de démo HERMES Korea — l'app n'est pas « vierge » au premier lancement.

Pour la présentation finale du projet Hanyang, HERMES Korea démarre directement
avec :

1. **Un nettoyage des données héritées** de HERMES France (une seule fois) :
   AO des portails français (BOAMP, TED, DECP…) et tout ce qui en dépend
   (documents, analyses KRINOS, réponses HERMION, base de connaissances),
   journal des agents, lignes `portails` obsolètes et cache DECP. Les AO déjà
   collectés sur KONEPS / Banque mondiale sont conservés.
2. **Le profil de démo** (`hermes.profil_demo`) : profil métier, mots-clés
   larges, workflow HERMION, pipeline — il remplace l'ancien préset (LinkMobility).
3. **Des AO anglais d'exemple** (références ``DEMO-…``), la plupart déjà analysés
   par KRINOS, quelques-uns « bruts » pour montrer l'analyse en direct, et deux
   brouillons HERMION en attente de validation humaine.

Idempotent : une version (`demo.precharge.version`) est mémorisée dans
`parametres` ; rien n'est refait tant qu'elle ne change pas. Désactivable via
``HERMES_DEMO_PRECHARGE=false``. La clé Gemini (chiffrée en base) n'est jamais
touchée.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from loguru import logger
from sqlmodel import Session, select

from hermes import profil_demo
from hermes.agents.argos.registry import creer_scraper, scrapers_disponibles
from hermes.db.models import (
    AnalyseKrinos,
    AppelOffre,
    LogAgent,
    NiveauLog,
    Parametre,
    Portail,
    ReponseHermion,
    StatutAO,
    StatutReponse,
)

CLE_VERSION = "demo.precharge.version"
VERSION = "korea-1"

_URL_KONEPS = "https://www.g2b.go.kr"
_URL_BANQUE_MONDIALE = "https://projects.worldbank.org/en/projects-operations/procurement"


@dataclass(frozen=True)
class AnalyseDemo:
    score: float
    resume: str
    justification: str
    tags: tuple[str, ...]
    dimensions: dict[str, float]
    criteres: str


@dataclass(frozen=True)
class AODemo:
    reference: str
    portail: str
    titre: str
    emetteur: str
    objet: str
    budget: float | None
    devise: str
    publie_il_y_a_jours: int
    limite_dans_jours: int
    type_marche: str
    zone: str
    statut: StatutAO
    analyse: AnalyseDemo | None = None


def _dims(metier: float, refs: float, budget: float, equipe: float, cal: float) -> dict:
    return {
        "affinite_metier": metier,
        "references": refs,
        "adequation_budget": budget,
        "capacite_equipe": equipe,
        "calendrier": cal,
    }


# --------------------------------------------------------------------------- #
# AO d'exemple (anglais) — marché coréen (KONEPS, avis internationaux) et
# projets financés par la Banque mondiale en Asie.
# --------------------------------------------------------------------------- #

AO_DEMO: tuple[AODemo, ...] = (
    AODemo(
        reference="DEMO-KR-2026-001",
        portail="koneps",
        titre="Next-generation e-procurement system cloud migration (KONEPS 2.0 support)",
        emetteur="Public Procurement Service (PPS)",
        objet=(
            "Migration of legacy procurement modules to a cloud-native architecture, "
            "including data migration, security hardening (ISMS-P) and 24-month "
            "maintenance. Open to Korean IT service providers with public-sector references."
        ),
        budget=4_800_000_000,
        devise="KRW",
        publie_il_y_a_jours=3,
        limite_dans_jours=34,
        type_marche="Services",
        zone="Daejeon, South Korea",
        statut=StatutAO.EN_REDACTION,
        analyse=AnalyseDemo(
            score=88,
            resume=(
                "PPS is migrating core e-procurement modules to the cloud. Scope covers "
                "architecture redesign, data migration, ISMS-P security and 2 years of "
                "maintenance. Strong match with our cloud migration references."
            ),
            justification=(
                "Excellent business fit (cloud migration for a public body), ISO 27001 "
                "covers the security requirements, budget in our usual range. Tight but "
                "feasible timeline."
            ),
            tags=("cloud", "e-government", "migration", "security"),
            dimensions=_dims(92, 85, 80, 75, 70),
            criteres=(
                "- ISMS-P or ISO 27001 certification\n- 2 similar public cloud projects in "
                "the last 5 years\n- Korean-language project manager on site"
            ),
        ),
    ),
    AODemo(
        reference="DEMO-KR-2026-002",
        portail="koneps",
        titre="AI-based civil complaint chatbot platform for Seoul Metropolitan Government",
        emetteur="Seoul Metropolitan Government",
        objet=(
            "Design and deployment of a multilingual (Korean/English/Chinese) AI chatbot "
            "platform for civil complaints, with integration to the existing 120 Dasan "
            "call centre system."
        ),
        budget=1_900_000_000,
        devise="KRW",
        publie_il_y_a_jours=2,
        limite_dans_jours=28,
        type_marche="Services",
        zone="Seoul, South Korea",
        statut=StatutAO.ANALYSE,
        analyse=AnalyseDemo(
            score=79,
            resume=(
                "Seoul wants a multilingual AI chatbot for civil complaints connected to "
                "its call centre. Requires NLP, LLM integration and public data security."
            ),
            justification=(
                "Strong fit with our AI/data platform offer; smart-city sector is a "
                "priority. Partner may be needed for Chinese language support."
            ),
            tags=("AI", "chatbot", "smart city", "LLM"),
            dimensions=_dims(90, 75, 85, 70, 80),
            criteres="- Software business registration\n- Personal data protection plan",
        ),
    ),
    AODemo(
        reference="DEMO-KR-2026-003",
        portail="koneps",
        titre="Integrated information security monitoring system for national universities",
        emetteur="Ministry of Education",
        objet=(
            "Build an integrated security monitoring (SOC) system covering 10 national "
            "universities, including SIEM deployment and 24/7 monitoring services."
        ),
        budget=3_200_000_000,
        devise="KRW",
        publie_il_y_a_jours=5,
        limite_dans_jours=40,
        type_marche="Services",
        zone="Sejong, South Korea",
        statut=StatutAO.ANALYSE,
        analyse=AnalyseDemo(
            score=77,
            resume=(
                "Ministry of Education tender for a shared SOC across national "
                "universities: SIEM, log collection and 24/7 security monitoring."
            ),
            justification=(
                "Good fit (cybersecurity + education). 24/7 operations require staffing "
                "that stretches team capacity."
            ),
            tags=("cybersecurity", "SOC", "education"),
            dimensions=_dims(85, 78, 75, 60, 75),
            criteres="- Information security service provider designation\n- ISO 27001",
        ),
    ),
    AODemo(
        reference="DEMO-KR-2026-004",
        portail="koneps",
        titre="Public data open platform enhancement and API gateway services",
        emetteur="National Information Society Agency (NIA)",
        objet=(
            "Enhancement of the public data portal: new API gateway, metadata catalogue "
            "and usage analytics dashboard."
        ),
        budget=1_250_000_000,
        devise="KRW",
        publie_il_y_a_jours=1,
        limite_dans_jours=21,
        type_marche="Services",
        zone="Daegu, South Korea",
        statut=StatutAO.ANALYSE,
        analyse=AnalyseDemo(
            score=76,
            resume="NIA upgrades the public data portal with an API gateway and analytics.",
            justification="Solid data platform fit; short deadline to prepare the bid.",
            tags=("open data", "API", "platform"),
            dimensions=_dims(82, 70, 78, 75, 60),
            criteres="- Software business registration",
        ),
    ),
    AODemo(
        reference="DEMO-KR-2026-005",
        portail="koneps",
        titre="Smart port digital twin system development (Busan New Port)",
        emetteur="Busan Port Authority",
        objet=(
            "Development of a digital twin of container terminal operations with IoT "
            "data integration and simulation for berth planning."
        ),
        budget=6_500_000_000,
        devise="KRW",
        publie_il_y_a_jours=6,
        limite_dans_jours=45,
        type_marche="Services",
        zone="Busan, South Korea",
        statut=StatutAO.ANALYSE,
        analyse=AnalyseDemo(
            score=68,
            resume="Busan Port Authority seeks a digital twin of terminal operations.",
            justification=(
                "Interesting smart-city/transport project but large budget and IoT scope "
                "would need a consortium."
            ),
            tags=("digital twin", "IoT", "transport"),
            dimensions=_dims(70, 55, 60, 55, 80),
            criteres="- Consortium allowed (max 3 members)",
        ),
    ),
    AODemo(
        reference="DEMO-KR-2026-006",
        portail="koneps",
        titre="Hospital information system (HIS) maintenance services for public medical centres",
        emetteur="National Medical Center",
        objet="Two-year maintenance and minor enhancements of the hospital information system.",
        budget=980_000_000,
        devise="KRW",
        publie_il_y_a_jours=4,
        limite_dans_jours=19,
        type_marche="Services",
        zone="Seoul, South Korea",
        statut=StatutAO.ANALYSE,
        analyse=AnalyseDemo(
            score=61,
            resume="Maintenance of the HIS used by public medical centres.",
            justification="Maintenance fits our offer, but we lack health-sector references.",
            tags=("health", "maintenance"),
            dimensions=_dims(65, 40, 75, 70, 55),
            criteres="- Prior HIS maintenance experience required",
        ),
    ),
    AODemo(
        reference="DEMO-KR-2026-007",
        portail="koneps",
        titre="Office PC and software licence supply for regional tax offices",
        emetteur="National Tax Service",
        objet="Supply of 1,200 desktop PCs with OS and office software licences.",
        budget=1_600_000_000,
        devise="KRW",
        publie_il_y_a_jours=2,
        limite_dans_jours=14,
        type_marche="Goods",
        zone="South Korea (nationwide)",
        statut=StatutAO.ANALYSE,
        analyse=AnalyseDemo(
            score=32,
            resume="Hardware and licence supply for tax offices.",
            justification="Pure goods supply, not our business (we sell services).",
            tags=("hardware", "supply"),
            dimensions=_dims(20, 30, 50, 60, 40),
            criteres="- Direct manufacturer or authorised reseller",
        ),
    ),
    AODemo(
        reference="DEMO-WB-2026-101",
        portail="banque_mondiale",
        titre="Digital Government Transformation Project — e-services platform consulting",
        emetteur="Ministry of Information and Communications, Viet Nam",
        objet=(
            "Consulting services to design and supervise a national e-services platform "
            "(single sign-on, payment gateway, interoperability layer). World Bank-financed."
        ),
        budget=2_400_000,
        devise="USD",
        publie_il_y_a_jours=4,
        limite_dans_jours=30,
        type_marche="Consulting Services",
        zone="Viet Nam",
        statut=StatutAO.EN_REDACTION,
        analyse=AnalyseDemo(
            score=86,
            resume=(
                "Viet Nam e-government platform consulting, financed by the World Bank. "
                "Design and supervision of SSO, payment and interoperability components."
            ),
            justification=(
                "Direct match with our Viet Nam e-government reference; Korean e-gov "
                "know-how is a strong selling point. Expression of interest only."
            ),
            tags=("e-government", "consulting", "World Bank", "Viet Nam"),
            dimensions=_dims(92, 90, 80, 70, 85),
            criteres=(
                "- Expression of Interest (EOI) with firm profile\n- 3 similar assignments "
                "in the last 10 years"
            ),
        ),
    ),
    AODemo(
        reference="DEMO-WB-2026-102",
        portail="banque_mondiale",
        titre="Health information system strengthening — software development services",
        emetteur="Ministry of Health, Indonesia",
        objet=(
            "Development of an interoperable health information system linking primary "
            "care facilities, with data warehouse and reporting dashboards."
        ),
        budget=3_100_000,
        devise="USD",
        publie_il_y_a_jours=7,
        limite_dans_jours=38,
        type_marche="Non-consulting Services",
        zone="Indonesia",
        statut=StatutAO.ANALYSE,
        analyse=AnalyseDemo(
            score=71,
            resume="Indonesia health information system with data warehouse and dashboards.",
            justification="Good data platform fit; health-sector references are limited.",
            tags=("health", "data", "World Bank"),
            dimensions=_dims(78, 55, 70, 65, 80),
            criteres="- International competitive bidding\n- Local partner recommended",
        ),
    ),
    AODemo(
        reference="DEMO-WB-2026-103",
        portail="banque_mondiale",
        titre="Cybersecurity capacity building and national CERT system upgrade",
        emetteur="Ministry of Digital Development, Mongolia",
        objet="Upgrade of national CERT tooling and training programme for 200 civil servants.",
        budget=1_500_000,
        devise="USD",
        publie_il_y_a_jours=3,
        limite_dans_jours=26,
        type_marche="Consulting Services",
        zone="Mongolia",
        statut=StatutAO.ANALYSE,
        analyse=AnalyseDemo(
            score=74,
            resume="Mongolia national CERT upgrade with a training component.",
            justification="Cybersecurity is a core skill; training part needs a partner.",
            tags=("cybersecurity", "training", "World Bank"),
            dimensions=_dims(80, 65, 75, 65, 75),
            criteres="- Certified security trainers (CISSP or equivalent)",
        ),
    ),
    AODemo(
        reference="DEMO-WB-2026-104",
        portail="banque_mondiale",
        titre="Land registration digitalisation system — design, supply and installation",
        emetteur="Department of Agrarian Reform, Philippines",
        objet=(
            "Digitalisation of land titles: scanning, GIS-enabled registry software and "
            "nationwide rollout to 40 provincial offices."
        ),
        budget=5_200_000,
        devise="USD",
        publie_il_y_a_jours=9,
        limite_dans_jours=52,
        type_marche="Information Systems",
        zone="Philippines",
        statut=StatutAO.ANALYSE,
        analyse=AnalyseDemo(
            score=58,
            resume="Philippines land registry digitalisation with GIS software.",
            justification="Software part fits; scanning and nationwide rollout are heavy.",
            tags=("GIS", "digitalisation", "World Bank"),
            dimensions=_dims(62, 50, 55, 45, 85),
            criteres="- Single-stage two-envelope bidding",
        ),
    ),
    AODemo(
        reference="DEMO-WB-2026-105",
        portail="banque_mondiale",
        titre="Education management information system (EMIS) — consulting services",
        emetteur="Ministry of Education and Sports, Lao PDR",
        objet="Design of a national EMIS and data governance framework for schools.",
        budget=850_000,
        devise="USD",
        publie_il_y_a_jours=2,
        limite_dans_jours=24,
        type_marche="Consulting Services",
        zone="Lao PDR",
        statut=StatutAO.ANALYSE,
        analyse=AnalyseDemo(
            score=72,
            resume="Lao PDR national education management information system design.",
            justification="Education + data governance fit; modest budget.",
            tags=("education", "data", "World Bank"),
            dimensions=_dims(80, 60, 70, 80, 70),
            criteres="- EOI, firm experience in EMIS projects",
        ),
    ),
    AODemo(
        reference="DEMO-WB-2026-106",
        portail="banque_mondiale",
        titre="Rural road rehabilitation works — Package 3",
        emetteur="Ministry of Rural Development, Cambodia",
        objet="Civil works for the rehabilitation of 120 km of rural roads.",
        budget=12_000_000,
        devise="USD",
        publie_il_y_a_jours=8,
        limite_dans_jours=33,
        type_marche="Works",
        zone="Cambodia",
        statut=StatutAO.REJETE,
        analyse=AnalyseDemo(
            score=12,
            resume="Civil works for rural roads in Cambodia.",
            justification="Out of scope: civil works, no IT component.",
            tags=("civil works", "out of scope"),
            dimensions=_dims(5, 10, 20, 10, 40),
            criteres="- Works contractor registration",
        ),
    ),
    # Bruts : pas encore analysés, pour montrer KRINOS en direct pendant la démo.
    AODemo(
        reference="DEMO-KR-2026-008",
        portail="koneps",
        titre="Metaverse-based tourism promotion platform development",
        emetteur="Korea Tourism Organization",
        objet=(
            "Development of a digital metaverse platform promoting Korean tourism destinations, "
            "with English, Japanese and Chinese content."
        ),
        budget=850_000_000,
        devise="KRW",
        publie_il_y_a_jours=0,
        limite_dans_jours=25,
        type_marche="Services",
        zone="Wonju, South Korea",
        statut=StatutAO.BRUT,
    ),
    AODemo(
        reference="DEMO-KR-2026-009",
        portail="koneps",
        titre="Integrated traffic information system upgrade for Incheon",
        emetteur="Incheon Metropolitan City",
        objet="Upgrade of the ITS centre software and real-time traffic data platform.",
        budget=2_300_000_000,
        devise="KRW",
        publie_il_y_a_jours=0,
        limite_dans_jours=31,
        type_marche="Services",
        zone="Incheon, South Korea",
        statut=StatutAO.BRUT,
    ),
    AODemo(
        reference="DEMO-WB-2026-107",
        portail="banque_mondiale",
        titre="Digital public financial management system — consulting services",
        emetteur="Ministry of Finance, Bangladesh",
        objet=(
            "Consulting services for the design of an integrated financial management "
            "information system (IFMIS) and its data migration strategy."
        ),
        budget=2_000_000,
        devise="USD",
        publie_il_y_a_jours=1,
        limite_dans_jours=36,
        type_marche="Consulting Services",
        zone="Bangladesh",
        statut=StatutAO.BRUT,
    ),
)


# Brouillons HERMION en attente de validation humaine (jamais soumis par l'app).
# Cohérent avec le pipeline : un AO analysé au-dessus du seuil a déjà sa réponse
# (sinon l'orchestrateur relancerait la rédaction au démarrage).
_MENTION = "_Draft generated by HERMION — to be reviewed and submitted by a human only._"

BROUILLONS: dict[str, str] = {
    "DEMO-KR-2026-001": f"""## Understanding of the need

The Public Procurement Service wants to move the legacy modules of its
e-procurement system to a cloud-native architecture without service
interruption, while meeting ISMS-P security requirements and securing two years
of maintenance.

## Proposed solution and methodology

1. **Assessment (month 1-2)**: inventory of modules, data volumes and
   dependencies; target architecture on a CSAP-certified public cloud.
2. **Migration waves (month 3-9)**: containerisation, data migration with
   parallel run and rollback plan, ISMS-P controls built in.
3. **Stabilisation and maintenance (month 10-33)**: SLA-based support,
   monthly reporting, performance tuning.

## Team and references

Project manager with 12 years of public-sector delivery, 2 cloud architects,
1 security lead (ISO 27001 lead auditor), 8 engineers. Reference: cloud
migration for a metropolitan city (2024-2025).

{_MENTION}
""",
    "DEMO-WB-2026-101": f"""## Understanding of the need

The Ministry of Information and Communications of Viet Nam is seeking a firm to
design and supervise a national e-services platform (single sign-on, payment
gateway, interoperability layer), financed by the World Bank.

## Proposed solution and methodology

- **Diagnostic**: review of existing e-services and data exchange standards.
- **Design**: reference architecture inspired by Korea's e-government
  experience, interoperability framework and security baseline.
- **Supervision**: quality assurance of the implementing contractor, acceptance
  testing and capacity building for ministry staff.

## Team and references

Team leader (e-government architect), interoperability expert, security expert
and local coordinator. Reference: e-government platform in Viet Nam
(World Bank-financed).

{_MENTION}
""",
}


@dataclass(frozen=True)
class BilanPrecharge:
    applique: bool
    ao_supprimes: int = 0
    logs_supprimes: int = 0
    ao_ajoutes: int = 0


def est_applique(session: Session) -> bool:
    entree = session.get(Parametre, CLE_VERSION)
    return bool(entree and entree.valeur == VERSION)


def appliquer_si_necessaire(session: Session) -> BilanPrecharge:
    """Applique le préchargement de démo une seule fois par version."""
    if est_applique(session):
        return BilanPrecharge(applique=False)
    return appliquer(session)


def appliquer(session: Session) -> BilanPrecharge:
    """Nettoie les données héritées, charge le profil de démo et les AO d'exemple."""
    ao_supprimes, logs_supprimes = purger_donnees_heritees(session)
    profil_demo.appliquer(session)
    ao_ajoutes = semer_ao_demo(session)
    _marquer_version(session)
    session.add(
        LogAgent(
            agent="HERMES",
            niveau=NiveauLog.INFO,
            message=(
                f"Demo profile preloaded: {ao_ajoutes} sample tenders added, "
                f"{ao_supprimes} legacy tenders removed"
            ),
        )
    )
    session.commit()
    logger.info(
        "Préchargement démo {} : {} AO ajoutés, {} AO hérités et {} logs supprimés",
        VERSION,
        ao_ajoutes,
        ao_supprimes,
        logs_supprimes,
    )
    return BilanPrecharge(
        applique=True,
        ao_supprimes=ao_supprimes,
        logs_supprimes=logs_supprimes,
        ao_ajoutes=ao_ajoutes,
    )


def purger_donnees_heritees(session: Session) -> tuple[int, int]:
    """Supprime les AO hors portails coréens/asiatiques, le journal et le cache DECP.

    Retourne (AO supprimés, entrées de journal supprimées).
    """
    conn = session.connection()
    actifs = scrapers_disponibles()
    marques = ", ".join("?" for _ in actifs)
    ids_portails_actifs = [
        row[0]
        for row in conn.exec_driver_sql(
            f"SELECT id FROM portails WHERE nom IN ({marques})", tuple(actifs)
        ).fetchall()
    ]
    if ids_portails_actifs:
        garde = ", ".join(str(int(i)) for i in ids_portails_actifs)
        condition = f"portail_id IS NULL OR portail_id NOT IN ({garde})"
    else:
        condition = "1 = 1"
    ids_ao = [
        row[0]
        for row in conn.exec_driver_sql(
            f"SELECT id FROM appels_offre WHERE {condition}"
        ).fetchall()
    ]

    logs_supprimes = conn.exec_driver_sql("DELETE FROM logs_agents").rowcount or 0
    if ids_ao:
        conn.exec_driver_sql(
            "CREATE TEMP TABLE IF NOT EXISTS _ao_herites (id INTEGER PRIMARY KEY)"
        )
        conn.exec_driver_sql("DELETE FROM _ao_herites")
        for ao_id in ids_ao:
            conn.exec_driver_sql("INSERT INTO _ao_herites (id) VALUES (?)", (ao_id,))
        for table in ("documents", "analyses_krinos", "reponses_hermion", "base_connaissances"):
            conn.exec_driver_sql(
                f"DELETE FROM {table} WHERE appel_offre_id IN (SELECT id FROM _ao_herites)"
            )
        conn.exec_driver_sql("DELETE FROM appels_offre WHERE id IN (SELECT id FROM _ao_herites)")
        conn.exec_driver_sql("DROP TABLE _ao_herites")
    # Réponses validées des AO français réinjectées en contexte HERMION : hors sujet.
    conn.exec_driver_sql("DELETE FROM base_connaissances")
    conn.exec_driver_sql("DELETE FROM cache_decp")
    conn.exec_driver_sql(
        f"DELETE FROM portails WHERE nom NOT IN ({marques})", tuple(actifs)
    )
    session.commit()
    return len(ids_ao), logs_supprimes


def _portail(session: Session, nom: str) -> Portail:
    portail = session.exec(select(Portail).where(Portail.nom == nom)).first()
    if portail is None:
        scraper = creer_scraper(nom)
        portail = Portail(nom=scraper.nom, url_base=scraper.url_base, actif=True)
        session.add(portail)
        session.commit()
        session.refresh(portail)
    return portail


def semer_ao_demo(session: Session, maintenant: datetime | None = None) -> int:
    """Insère les AO d'exemple absents (clé : portail + référence). Retourne le nombre ajouté."""
    maintenant = maintenant or datetime.now(UTC)
    ajoutes = 0
    portails = {nom: _portail(session, nom) for nom in {a.portail for a in AO_DEMO}}
    for demo in AO_DEMO:
        portail = portails[demo.portail]
        existe = session.exec(
            select(AppelOffre.id).where(
                AppelOffre.portail_id == portail.id,
                AppelOffre.reference_externe == demo.reference,
            )
        ).first()
        if existe is not None:
            continue
        publie = maintenant - timedelta(days=demo.publie_il_y_a_jours)
        ao = AppelOffre(
            portail_id=portail.id,
            reference_externe=demo.reference,
            url_source=_URL_KONEPS if demo.portail == "koneps" else _URL_BANQUE_MONDIALE,
            titre=demo.titre,
            emetteur=demo.emetteur,
            objet=demo.objet,
            budget_estime=demo.budget,
            devise=demo.devise,
            date_publication=publie,
            date_limite=maintenant + timedelta(days=demo.limite_dans_jours),
            type_marche=demo.type_marche,
            zone_geographique=demo.zone,
            statut=demo.statut,
            cree_le=publie,
        )
        session.add(ao)
        session.commit()
        session.refresh(ao)
        if demo.analyse is not None:
            a = demo.analyse
            session.add(
                AnalyseKrinos(
                    appel_offre_id=ao.id,
                    resume=a.resume,
                    score=a.score,
                    justification_score=a.justification,
                    tags=json.dumps(list(a.tags), ensure_ascii=False),
                    criteres_extraits=a.criteres,
                    scores_dimensions=json.dumps(a.dimensions),
                    duree_analyse_ms=4200,
                    modele_llm="demo",
                    cree_le=publie + timedelta(hours=1),
                )
            )
        brouillon = BROUILLONS.get(demo.reference)
        if brouillon is not None:
            session.add(
                ReponseHermion(
                    appel_offre_id=ao.id,
                    version=1,
                    contenu=brouillon,
                    statut=StatutReponse.EN_ATTENTE,
                    longueur_mots=len(brouillon.split()),
                    duree_generation_ms=9800,
                )
            )
        session.commit()
        ajoutes += 1
    return ajoutes


def _marquer_version(session: Session) -> None:
    entree = session.get(Parametre, CLE_VERSION)
    if entree is None:
        entree = Parametre(
            cle=CLE_VERSION,
            valeur=VERSION,
            description="Demo preload applied (profile + sample tenders)",
        )
    else:
        entree.valeur = VERSION
        entree.maj_le = datetime.now(UTC)
    session.add(entree)
    session.commit()
