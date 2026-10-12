# Où tu t'es arrêté — branche `coaching`, 17 fichiers non commités

Reconstitution à partir du diff et des dates de modification. **Deux chantiers distincts**,
séparés de quatre jours. Le dernier geste date du **30 août, 02:38** (`CoachingDetail.jsx`).

---

## Chantier 1 — Coaching multi-organisation (backend) · 26 août, 15:41 → 15:49

Le moteur de coaching ne servait qu'un seul référentiel : *un* plan de vente actif, *des*
fiches produit actives, les mêmes pour tout le monde. Tu l'as ouvert à plusieurs
organisations.

**Fait :**

| Fichier | Changement |
|---|---|
| `backend/prisma/schema.prisma` | `tenantId String @default("")` sur `SalesPlanVersion`, `ProductSheetVersion`, `CoachingAnalysis`. Toutes les contraintes d'unicité repassent en local au tenant (`contentHash` n'est plus unique globalement). Idempotence coaching → `@@unique([source, tenantId, s3KeyOriginal, salesPlanVersionId])`, index nommé à la main (le nom dérivé dépassait les 63 car. de Postgres). Nouvelles colonnes `externalUserRef` / `externalPorteRef`. |
| `migrations/202608261000_coaching_multi_tenant/migration.sql` | **Nouveau.** La migration correspondante, écrite à la main, avec le raisonnement `""` vs `NULL` en commentaire (NULL ≠ NULL en SQL → les doublons passeraient). |
| `backend/src/coaching/shared/crm-scope.ts` | **Nouveau.** `CRM_SOURCE = 'prowin'` + `CRM_TENANT = ''`. Le CRM est mono-client, ses lignes portent la chaîne vide. |
| `coaching.service.ts` | Les deux `findUnique` d'idempotence passent sur la nouvelle clé composite. |
| `sales-plan.service.ts` | `getActiveVersion` restreint au `CRM_TENANT` (les deux branches fusionnées en une). |
| `product-sheet.service.ts` | Les trois requêtes filtrent sur `tenantId: CRM_TENANT`. |
| `coaching.dto.ts` | `recordingId` devient nullable (une app tierce n'a pas d'enregistrement CRM). |

**Laissé en suspens :**

- `externalUserRef` / `externalPorteRef` existent dans le schéma et la migration, mais
  **aucun code ne les écrit ni ne les lit**. La colonne est prête, le chemin d'écriture non.
- `lecture/coaching-query.service.ts` garde son **propre** `private readonly CRM_SOURCE = 'prowin'`
  (12 occurrences) : il n'a pas été branché sur `crm-scope.ts` et **ne filtre pas sur `tenantId`**.
  C'est le service qui alimente toutes les lectures du CRM.
- `__tests__/multi-app-crm.spec.ts` inspecte le texte de ce fichier (`expect(file).toContain(...)`) —
  à relancer.
- Migration jamais appliquée / vérifiée depuis ici.

---

## Chantier 2 — Responsivité (frontend) · 30 août, 01:53 → 02:38

Piloté par `.plannotator-plans/plan-responsive.md` (audit Playwright, 17 pages × 375/768/1024/1280).
Tu as suivi l'ordre d'exécution du plan, et tu t'es arrêté **avant les points C et D**.

| Étape du plan | État | Preuve |
|---|---|---|
| **A** — sidebar en tiroir jusqu'à 1023 px | ✅ | `use-mobile.js` : `MOBILE_BREAKPOINT` 768 → 1024 |
| **B** — header applicatif, fil d'Ariane tronquable | ✅ | `App.jsx` : `min-w-0` + `truncate` sur le fil, `shrink-0` sur les actions |
| **C** — adresses non tronquées, 4 listes coaching | ❌ **non fait** | `AnalyzedSessionsList`, `CoachingManagementList`, `CoachingIA`, `CoachingResultPanel` : **aucun n'est modifié** |
| **D** — fiche commercial, « dernière activité » coupée | ❌ **non fait** | `commercial/CommercialDetailView.jsx` intact |
| **E** — cards Statistiques (+3 px) | ✅ | `Statistiques.jsx` : `grid-cols-[minmax(0,1fr)]` sur 5 grilles |
| **F1** — modales coaching, compensation sidebar en dur | ✅ | `use-modal-geometry.js` **(nouveau)** lit `useSidebar` ; les `lg:ml-[9.5rem]` supprimés des deux modales |
| **F2** — en-tête de modale à 375 px | ✅ | `CoachingDetail.jsx` : `flex-col` → `sm:flex-row`, séparateurs `·` passés en CSS |
| **G** — `/gps-tracking`, panneau en tiroir | ⚠️ **fonctionnel mais sale** | `LocationTab.jsx` : `Sheet` + `useIsMobile` + bouton d'ouverture (l. 1544) |
| **H** — charts dashboard | ✅ rien à faire (décidé au plan) |
| *hors plan* | ✅ | `PersonListCard.jsx` : repli en deux niveaux sous 1280 px, largeurs fixes préfixées `xl:`, et **les boutons modifier/archiver ne sont plus en `group-hover` sur mobile** — ils étaient inatteignables au doigt |

### Le point à regarder en premier : `LocationTab.jsx`

Le fichier passe de ~1040 à **2006 lignes**. Le panneau est rendu **deux fois** : une branche
`Sheet` (l. 586–1067) et une branche `<aside>` (l. 1069–…), avec **~480 lignes de markup
dupliqué** entre les deux. Ça marche, mais c'est deux copies à maintenir en parallèle —
contraire à la règle « réutiliser avant de créer » du `CLAUDE.md`. Le panneau devrait être
un composant unique, monté dans l'un ou l'autre conteneur.

---

## Reste à faire, dans l'ordre

1. **`LocationTab.jsx`** — extraire le panneau en un composant, supprimer la duplication.
2. **C** puis **D** — les deux dernières coupes locales du plan.
3. **Vérification du plan** (rien n'a été relancé) : réaudit Playwright 17 pages × 4 largeurs,
   `npm run build`, `eslint`, `prettier`, specs `e2e/tests/admin-directeur/`.
   ⚠️ Il n'existe **aucun script d'audit responsive dans le repo** — l'audit était ad hoc.
4. **Backend multi-tenant** — brancher `coaching-query.service.ts` sur `crm-scope.ts` + `tenantId`,
   décider du chemin d'écriture de `externalUserRef` / `externalPorteRef`, appliquer la migration.
5. **Découpage des commits** — les deux chantiers sont indépendants, ils méritent deux commits
   (voire trois : backend multi-tenant / responsive global A+B+E+F / gps-tracking G).

## Questions ouvertes

- Le chantier backend multi-tenant est-il volontairement en pause, ou oublié derrière le
  chantier responsive ?
- `recordingId` nullable dans le DTO GraphQL : les consommateurs frontend ont-ils été vérifiés ?
