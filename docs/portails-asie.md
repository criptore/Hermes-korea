# Portails ARGOS : Corée et Asie

HERMES Korea surveille les marchés qu'un commercial coréen vise en priorité :
le marché public coréen et les projets financés à l'export en Asie. Les
scrapers français (BOAMP, TED) restent dans le code mais ne sont plus
enregistrés : ils ne sont plus collectés ni affichés.

| Portail ARGOS | Source | Accès | Langue des avis |
|---|---|---|---|
| `koneps` | KONEPS / 나라장터 (조달청), OpenAPI « 조달청_나라장터 입찰공고정보서비스 » sur data.go.kr | Gratuit, **clé de service** requise | Coréen |
| `banque_mondiale` | API `procnotices` de la Banque mondiale, pays d'Asie | Public, sans clé | Anglais |

## KONEPS / 나라장터

- Endpoint : `https://apis.data.go.kr/1230000/ad/BidPublicInfoService/`, une
  opération par nature : `getBidPblancListInfoThngPPSSrch` (fournitures),
  `…ServcPPSSrch` (services), `…CnstwkPPSSrch` (travaux). Le critère avancé
  *Contract type* restreint les opérations interrogées.
- Fenêtre : avis mis en ligne depuis la dernière collecte (marge 2 jours),
  7 jours à la première collecte, 30 jours maximum (limite de l'API).
- Mots-clés inclus poussés au serveur (`bidNtceNm`, une requête par mot-clé,
  jusqu'à 10) ; au-delà, collecte non filtrée puis filtre local.
- Référence : `bidNtceNo-bidNtceOrd` (un avis rectificatif a son propre ordre).
  Dates en heure de Séoul converties en UTC ; montants en KRW
  (`asignBdgtAmt`, sinon `presmptPrce`). Pièces du dossier : `ntceSpecDocUrl1..10`.

### Obtenir la clé de service (gratuit)

1. Créer un compte sur <https://www.data.go.kr>.
2. Chercher « 조달청_나라장터 입찰공고정보서비스 » et cliquer *활용신청*
   (demande d'utilisation) ; l'approbation est en général automatique.
3. Copier la clé *Decoding* (일반 인증키) depuis *마이페이지*.
4. Dans HERMES : *Settings → Monitored portals → KONEPS service key*. La clé est
   chiffrée (AES-256-GCM) dans MNEMOSYNE. Variante :
   `HERMES_KONEPS_SERVICE_KEY`.

Sans clé, la collecte KONEPS échoue avec un message qui explique quoi faire ;
la Banque mondiale continue de fonctionner.

## Banque mondiale (Asie)

- `GET https://search.worldbank.org/api/v2/procnotices?format=json`, trié par
  date de publication (`srt=submission_date&order=desc`), pagination `rows`/`os`.
- Pays : `project_ctry_code_exact` (ISO2 joints par `^`). Par défaut toute
  l'Asie couverte (Sud-Est, Est, Sud, Asie centrale, Pacifique) ; le critère
  avancé *Countries* (ISO3, ex. `VNM, IDN, UZB`) restreint la liste.
- Les attributions (`Contract Award`) et brouillons sont écartés.
- Lien de l'avis : `projects.worldbank.org/.../procurement-detail/<id>`.

## Non vérifié en conditions réelles

Les deux API n'étaient pas joignables depuis l'environnement de développement :
les parseurs sont défensifs et testés sur des réponses simulées conformes à la
documentation publique. À valider lors de la première collecte réelle (journal
ARGOS).

## Pistes suivantes

ADB (Banque asiatique de développement), UNGM (Nations unies), KOTRA (해외조달),
portails nationaux (Vietnam muasamcong, Indonésie LPSE…).
