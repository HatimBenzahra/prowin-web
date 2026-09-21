# Liste Personnes — seuils de mise en page sur la largeur réelle

## Goal

La liste Commerciaux / Managers / Équipe décide de sa mise en page sur la largeur de la
**fenêtre**, alors que la contrainte réelle est la largeur du **conteneur**. Sur un 14"
les deux mesures divergent de ~400 px : la page se replie trop tôt d'un côté et pas
assez de l'autre. On remplace les seuils viewport par des container queries, pour que
chaque bloc réagisse à la place dont il dispose vraiment.

## Le problème, mesuré

MacBook 14", sidebar ouverte, fenêtre plein écran :

| Mesure | Valeur |
|---|---|
| Viewport | 1512 px |
| − sidebar (`SIDEBAR_WIDTH = 16rem`) | 1256 px |
| − `w-11/12` (`App.jsx:195`) | 1151 px |
| − `p-6` × 2 | **1103 px utilisables** |

Deux seuils tombent du mauvais côté de cette largeur :

- **`Commerciaux.jsx:83`** — `2xl:grid-cols-[minmax(0,1fr)_320px]` exige **1536 px de
  viewport**. À 1512 px on est 24 px en dessous : la card « Paliers de rang » quitte la
  colonne de droite et s'étale en pleine largeur sous la liste. Or 1103 px de conteneur
  suffisent largement à tenir liste + panneau.
- **`PersonListCard.jsx`** — tous les `xl:` se déclenchent à **1280 px de viewport**,
  atteints. La rangée garde donc sa mise en page « d'un seul tenant » avec colonnes à
  largeur fixe (~620 px de colonnes fixes) dans un conteneur qui en offre 1103 :
  l'identité en `flex-1` absorbe tout le reste → le grand vide entre le nom et les
  statistiques.

Les deux symptômes ont **une seule cause** : le seuil est mesuré sur la fenêtre.
Et ils se corrigent l'un l'autre — remettre « Paliers » à droite ramène la colonne liste
à 759 px, soit exactement la largeur pour laquelle la rangée a été dessinée.

## Approche

Tailwind v4 est déjà en place (`tailwindcss ^4.1.14`) et le repo utilise déjà les
container queries (`CoachingSynthesisSection.jsx:167`, `PorteDetailModal.jsx:240`,
`ProspectionChartsSection.jsx:79`). On reste sur ce pattern, pas de nouvelle dépendance.

Deux conteneurs nommés, deux niveaux de décision indépendants :

- `@container/page` sur le wrapper de chaque page → décide **liste seule ou liste +
  panneau Paliers**.
- `@container/list` sur `PeopleCardsView` → décide **la forme d'une rangée**, à partir
  de la largeur que la grille lui a effectivement laissée.

Le second lit le résultat du premier : c'est la chaîne qui manquait.

**On ne pose PAS `@container` sur `App.jsx`.** `container-type: inline-size` implique
`contain: layout`, ce qui fait du wrapper un bloc conteneur pour les descendants en
`position: fixed`. Appliqué au wrapper global, ça déplacerait modales et overlays de
toute l'application. Les conteneurs restent locaux aux pages concernées.

### Budget de largeur d'une rangée

Colonnes fixes de `PersonListCard`, additionnées :

| Élément | px |
|---|---|
| `p-4` × 2 | 32 |
| avatar 36 + `gap-3` | 48 |
| gap inter-blocs `gap-x-4` × 3 | 48 |
| palier `w-24` + rang `4.5rem` + points `w-14` + contrats `w-16` + 3 × `gap-3` | 324 |
| « Vu … » `w-[6.5rem]` | 104 |
| actions `w-16` | 64 |
| **Total hors identité** | **620** |

Avec ~180 px de nom lisible : **~800 px** pour la rangée complète, **~680 px** sans la
colonne « Vu ». D'où trois paliers plutôt que deux :

| Largeur de la colonne liste | Rangée |
|---|---|
| `< 680 px` | repli deux niveaux (identité + actions, puis gamification dessous) |
| `≥ 680 px` | rangée d'un seul tenant, **sans** « Vu » |
| `≥ 800 px` | + colonne « Vu » |

Le palier intermédiaire est nouveau : aujourd'hui « Vu » et le repli partagent le même
seuil, ce qui force à sacrifier la rangée entière pour gagner 104 px.

Et pour la grille : `680 + 24 (gap) + 320 (panneau) = 1024 px` de conteneur page.
À 1103 px sur le 14", **le panneau Paliers revient à droite** et la liste reçoit 759 px
→ rangée d'un seul tenant sans « Vu ». C'est la cible.

## Steps

### 1. `PeopleCardsView.jsx` — déclarer le conteneur de liste

`src/components/people/PeopleCardsView.jsx:48` — `<div className="space-y-3">` devient
`<div className="@container/list space-y-3">`. Un commentaire explique que c'est la
mesure sur laquelle `PersonListCard` se replie.

Le conteneur est porté par la vue, pas par la page : les trois pages en héritent sans
rien déclarer, et une future page aussi.

### 2. `PersonListCard.jsx` — trois paliers au lieu d'un

Remplacer chaque `xl:` par sa container query, en séparant les deux seuils :

| Aujourd'hui | Demain |
|---|---|
| `xl:flex-nowrap` (ligne 84) | `@min-[680px]/list:flex-nowrap` |
| `xl:order-none`, `xl:w-auto`, `xl:justify-start`, `xl:gap-3`, `xl:flex-nowrap` (bloc gamification, l. 123) | idem en `@min-[680px]/list:` |
| `xl:w-24`, `xl:w-[4.5rem]`, `xl:w-14`, `xl:w-16` (largeurs de colonnes) | idem en `@min-[680px]/list:` |
| `hidden … xl:block` sur « Vu » (l. 148) | `hidden … @min-[800px]/list:block` — **seuil propre** |
| `xl:opacity-0 xl:group-hover:opacity-100` (actions) | `@min-[680px]/list:opacity-0 @min-[680px]/list:group-hover:opacity-100` |
| `xl:order-none xl:ml-0` (zone actions) | idem en `@min-[680px]/list:` |

Mettre à jour le JSDoc du composant : il parle de « 1280 px » à quatre reprises et
décrira désormais des largeurs de conteneur. La raison documentée (alignement des
colonnes d'une ligne à l'autre, impossibilité du survol au doigt) reste valable telle
quelle — seule la mesure change.

### 3. Les trois pages — grille sur la largeur du conteneur

`Commerciaux.jsx:83`, `Managers.jsx:57`, `Equipe.jsx:119` portent la **même** classe.
Sur chacune :

- wrapper de page (`<div className="space-y-6">`) → `@container/page space-y-6`
- grille : `2xl:grid-cols-[minmax(0,1fr)_320px]` → `@min-[1024px]/page:grid-cols-[minmax(0,1fr)_320px]`

Le commentaire de `Commerciaux.jsx:75-82` justifie le seuil 1536 par un calcul en
largeur de fenêtre ; il est réécrit avec le budget ci-dessus.

`Directeurs.jsx` utilise `PeopleCardsView` sans la grille à deux colonnes : il profite
de l'étape 1-2 sans modification.

## Verification

1. `npx eslint src/components/people src/pages-ADMIN-DIRECTEUR/{commercial,managers,equipe}`
2. `npm run build` — les container queries arbitraires (`@min-[680px]/list:`) sont
   générées à la compilation ; une faute de syntaxe produit une classe silencieusement
   absente, le build est le seul garde-fou.
3. Contrôle visuel aux quatre largeurs de fenêtre, sidebar ouverte **et** repliée
   (la sidebar repliée passe de 16rem à 3rem — c'est précisément le cas que les seuils
   viewport ne voyaient pas) :

   | Fenêtre | Attendu |
   |---|---|
   | 1512 px (14") | Paliers **à droite**, rangée d'un seul tenant, pas de « Vu » |
   | 1512 px sidebar repliée | Paliers à droite, rangée **avec** « Vu » |
   | 1280 px | Paliers sous la liste, rangée d'un seul tenant |
   | 900 px | Paliers dessous, rangée repliée en deux niveaux |
   | 390 px (mobile) | rangée repliée, boutons Modifier/Archiver **visibles** sans survol |

4. `npx playwright test` sur les specs qui ciblent `a[href^="/commerciaux/"]` si elles
   existent — à confirmer avant de m'y engager.

## Risks / open questions

1. **Le vide entre nom et stats ne disparaît qu'aux largeurs où « Paliers » occupe la
   droite.** Sur un écran 27" (conteneur plafonné à `max-w-[1400px]`, liste à ~1056 px),
   il restera ~250 px entre le nom et le palier. C'est le comportement d'une rangée de
   liste classique — l'identité prend la place libre. **Question : on garde, ou tu veux
   que je plafonne aussi la largeur du bloc identité ?**

2. **Les trois symptômes cosmétiques que tu n'as pas tranchés** dans mes questions —
   je ne les touche pas dans ce plan, dis-moi si tu en veux :
   - pas de libellé « PALIER » au-dessus du badge Bronze, alors que RANG / POINTS /
     CONTRATS en ont un → rangée asymétrique ;
   - « Vu 06 août 2026 » sans libellé non plus ;
   - boutons Modifier / Archiver en opacité 0 hors survol → la card se termine sur
     64 px de vide à droite. Les rendre visibles en permanence (comme sous 680 px)
     supprimerait ce vide.

3. **Seuil 1024 px choisi au budget, pas au pixel près.** Si à l'usage la rangée paraît
   serrée à 759 px, le seuil de grille monte à 1100 px et le panneau repasse dessous
   sur le 14". C'est un chiffre, pas une architecture — ajustable en une ligne.

4. **Aucun changement de comportement au-dessus de 1536 px** : ce qui marche
   aujourd'hui sur grand écran continue à marcher à l'identique.
