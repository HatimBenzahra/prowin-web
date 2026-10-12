# Responsivité — pages détail, listes, coaching, dashboard

Plan issu d'un audit mesuré sur `staging.pro-win.app` (Playwright, 17 pages × 4 largeurs :
375 / 768 / 1024 / 1280 px), pas d'une inspection à l'œil.

## Méthode d'audit — et pourquoi le premier passage était faux

Un élément qui dépasse la fenêtre n'est un bug que s'il est **coupé**. Le premier passage
signalait 40 débordements ; en reclassant chaque élément selon qu'un ancêtre scrollable le
rattrape (`overflow-x: auto` + `scrollWidth > clientWidth`) ou qu'un `overflow-x: hidden` le
tronque, **la moitié étaient des faux positifs** : les `<table>` sont déjà enveloppées par
`ui/table.jsx` dans un conteneur `overflow-x-auto`, elles scrollent, elles vont bien.

Conséquence directe : **/zones, /gestion et les tableaux du dashboard ne sont pas cassés**,
contrairement à ce que laissait croire la première mesure. Ils sortent du périmètre.

Le vrai symptôme partout ailleurs : `scroll doc = +0` mais des éléments à `+38`, `+167`,
`+435` px hors cadre. Le conteneur applicatif est en `overflow-x-hidden` (`App.jsx:184`) :
rien n'est scrollé, tout est **amputé sans trace**.

## État mesuré (après reclassement)

| Page | 375 | 768 | 1024 | 1280 |
|---|---|---|---|---|
| `/` dashboard | ok | ok | ok | ok |
| `/equipe` | ok | ok | ok | ok |
| `/zones`, `/gestion` | ok | ok | ok | ok |
| `/commerciaux`, `/managers`, `/directeurs` | ok | **KO +38** | ok | ok |
| `/immeubles`, `/adresses` | ok | **KO +16** | ok | ok |
| `/statistiques` | **KO +3** | **KO +26** | ok | ok |
| `/zones/historique` | **KO +38** | **KO +86** | ok | ok |
| `/coaching` | **KO +168** | **KO +29** | ok | ok |
| `/ecoutes/enregistrement` | **KO +108** | **KO +156** | ok | ok |
| `/commerciaux/:id` | **KO +187** | **KO +110** | ok | ok |
| `/directeurs/:id`, `/immeubles/:id` | **KO +42** | **KO +89** | ok | ok |
| `/gps-tracking` | **KO +435** | ok | ok | ok |

---

## A. Sidebar fixe jusqu'à 767 px — corrige 8 pages d'un coup

`hooks/ui/use-mobile.js` fixe `MOBILE_BREAKPOINT = 768`. À 768 px exactement la sidebar est
donc en mode desktop : **256 px en dur, la moitié de l'écran**, 512 px restants pour la page.
La capture à 768 px le montre sans ambiguïté. C'est la cause unique de tous les `KO @768`.

**Changement** : `MOBILE_BREAKPOINT` 768 → 1024. La sidebar devient un tiroir (Sheet) jusqu'à
1023 px inclus.

**Pourquoi c'est sûr** : `useIsMobile` n'a qu'un seul consommateur dans tout le repo —
`components/ui/sidebar.jsx:39`. Aucun autre comportement n'en dépend.

**Effet attendu** : `/commerciaux`, `/managers`, `/directeurs`, `/immeubles`, `/adresses`,
`/statistiques`, `/coaching`, `/zones/historique` et les trois fiches détail repassent au vert
à 768 px.

## B. Le header applicatif pousse sa zone droite hors écran

`App.jsx:147` — le `<nav>` du fil d'Ariane n'a ni `min-w-0` ni troncature. Un fil long
(« Zones en cours › Historique », « Bibliothèque › … ») pousse la zone recherche + thème
(`App.jsx:169`) au-delà du bord, où `overflow-x-hidden` la coupe. C'est l'offender qui revient
sur **10 des 17 pages**.

**Changement** : `min-w-0` + troncature sur le fil d'Ariane, `shrink-0` sur la zone droite —
le fil se tronque, les actions restent atteignables. C'est déjà le parti pris du repo ailleurs
(« quand la place manque, c'est le nom qui tronque »).

## C. Adresses non tronquées dans les listes coaching

`span.ml-2 font-normal text-muted-foreground` : l'adresse (231 px) est **coupée de 167 px** à
375 px. Quatre occurrences du même motif :

- `coaching/AnalyzedSessionsList.jsx:94`
- `coaching/CoachingManagementList.jsx:299`
- `coaching/CoachingIA.jsx:160`
- `coaching/CoachingResultPanel.jsx:256`

**Changement** : `min-w-0` sur le conteneur + troncature sur l'adresse, ou passage à la ligne
sous le titre selon ce que la maquette de la ligne permet. Traiter les quatre au même endroit
logique pour ne pas diverger.

## D. Fiche commercial — dernière activité coupée

`commercial/CommercialDetailView.jsx:96` : `<span className="opacity-70"> · {lastActivityDesc}</span>`
suit le titre sans `min-w-0` ni troncature → **coupé de 187 px** à 375 px.

**Changement** : rendre le bloc tronquable, ou passer la mention sous le titre en dessous de
`sm`. Vérifier au passage les fiches manager / directeur / immeuble, qui partagent
`components/details/`.

## E. Statistiques — cards qui dépassent de 3 px à 375 px

Deux cards à 340 px dans un conteneur de 337 px. Débordement minime mais réel (bordure droite
rognée). À traiter avec les largeurs de la grille de la page, pas par un `-mx` compensatoire.

## F. Modales de coaching

Deux problèmes distincts.

**F1 — compensation de sidebar codée en dur.** `CoachingDetailModal.jsx:9` et
`AnalyzedRecordingsModal.jsx:37` portent tous deux :

```
lg:ml-[9.5rem] lg:w-[calc(100vw-19rem)]
```

Ces `9.5rem` / `19rem` ne sont vrais que si la sidebar est ouverte à 16rem. Dès qu'elle est
repliée en mode icône (3rem), la modale reste décalée et n'est plus centrée. Et le seuil `lg`
(1024 px) ne correspondra plus au nouveau seuil de bascule décidé en **A**.

**Changement** : dériver la largeur de la variable de sidebar déjà exposée par
`SidebarProvider` (`--sidebar-width` / `--sidebar-width-icon`), ou revenir à un centrage
normal sur le viewport. Pas de valeur en dur — le `CLAUDE.md` du projet l'exclut.

**F2 — en-tête de modale à 375 px** (constaté sur capture) : le titre tombe à « 14 Rue… »
pendant que « Favori », « Relancer » et la croix occupent le reste de la ligne ; la date, la
durée et le score 77/100 se tassent en trois blocs qui se chevauchent ; le contenu passe sous
les blocs collants au défilement.

**Changement** : en-tête repliable sous `sm` — titre sur sa propre ligne, actions en dessous ;
vérifier les hauteurs collantes une fois replié.

## G. /gps-tracking — panneau latéral en tiroir

`aside.w-[360px] shrink-0` + le canvas Mapbox : **+435 px** hors cadre à 375 px, la carte est
inutilisable.

**Changement** (option retenue) : le panneau passe en tiroir/overlay sous 1024 px, la carte
prend toute la largeur, un bouton l'ouvre. Réutiliser le composant `Sheet` déjà présent dans
`components/ui/` plutôt que d'en écrire un.

## H. Charts du dashboard — rien à corriger

Vérifié par capture pleine page à 375 et 768 px : les `recharts` sont déjà en conteneur
responsive, « Rythme du mois » garde ses axes et sa légende lisibles à 375 px, « Où vont les
portes » et « Activité par commercial » tiennent. **Aucun changement prévu.**

Deux observations hors périmètre responsivité, à confirmer avant toute action :
- `TerrainMapCard` occupe ~380 px de hauteur vide quand personne n'est sur le terrain ;
- elle affiche « Personne sur le terrain aujourd'hui », message que `ActiveCommercialsCard`
  répète juste en dessous.

---

## Ordre d'exécution

1. **A** puis **B** — les deux causes globales ; réaudit derrière pour voir combien de lignes
   du tableau repassent au vert avant d'écrire une seule correction locale.
2. **C**, **D**, **E** — les coupes locales restantes.
3. **F** — modales de coaching.
4. **G** — `/gps-tracking`.

## Vérification

Rejouer l'audit Playwright (17 pages × 375/768/1024/1280) après chaque étape, plus les
captures de la modale coaching et du dashboard. Critère de fin : **zéro élément coupé sur les
17 pages aux quatre largeurs**, et aucun changement de rendu au-dessus de 1280 px.

`npm run build`, `eslint`, `prettier` sur chaque fichier touché. Les specs e2e existantes
(`e2e/tests/admin-directeur/`) s'appuient sur `a[href^="/commerciaux/"]` et sur les rôles
ARIA : à relancer, aucune ne doit bouger.

## Ce que ce plan ne fait pas

- Ne touche pas aux `<table>` : elles scrollent déjà correctement.
- Ne touche pas à `/zones`, `/gestion`, `/equipe`, ni au dashboard.
- Ne modifie aucun rendu au-dessus de 1280 px.
- Ne déploie rien : le déploiement reste une demande explicite de ta part.
