import { test } from '@playwright/test'
import {
  caption,
  chapter,
  clearCaption,
  highlight,
  readScout,
  seen,
  startTimeline,
  waitForMaps,
} from './tour-helpers.js'

/**
 * LA vidéo d'explication du produit — une seule prise.
 *
 * Ordre voulu, et il n'est pas arbitraire : on part de la maille la plus fine (la
 * porte et son échange) pour remonter vers l'agrégat, au lieu de commencer par des
 * compteurs qu'on ne saurait pas encore interpréter.
 *
 *   0. la barre latérale, et le fait qu'une vue simplifiée existe
 *   1. la page Utilisateurs : liste commune commerciaux/managers, les rangs, les
 *      points, « Non classé », et d'où vient « Vu le… »
 *   2. la fiche d'une personne
 *   3. l'onglet Bâtiments — LA clé : adresse → façade → porte → enregistrement +
 *      coaching de cet échange
 *   4. la liaison : la synthèse coaching globale est l'agrégat de ces analyses
 *   5. les autres onglets : Perf & prospection, Contrats, Terrain
 *   6. seulement à la fin, le filtre de période, et ce sur quoi il agit
 *
 * Trois règles de fond :
 *
 * 1. LECTURE SEULE. Aucun clic qui écrive sur staging : ni « Lancer l'analyse » ni
 *    « Relancer » (ça déclencherait une vraie analyse et de la charge serveur), ni
 *    « Régénérer », ni Favori, ni Modifier/Archiver/Supprimer. Ces commandes sont
 *    MONTRÉES et expliquées, jamais déclenchées. Les cases à cocher de sélection,
 *    elles, sont purement locales.
 *
 * 2. AUCUN FILTRE DE PÉRIODE APPLIQUÉ AVANT LA FIN. Les données de staging sont
 *    anciennes : un raccourci comme « Ce mois-ci » vide la fiche, et on se
 *    retrouverait à expliquer des compteurs à zéro et un tableau vide. Le filtre est
 *    donc présenté en dernier, une fois tout le contenu montré.
 *
 * 3. Aucune mention de rôle (directeur, manager…) : on décrit l'interface et ce
 *    qu'on en tire, pas qui la regarde.
 */

test('guide — lire une fiche, de la porte au bilan', async ({ page }) => {
  // L'horloge de la prise démarre AVANT toute navigation : c'est elle qui datera les
  // chapitres écrits dans le mp4. Voir tour-helpers.js.
  startTimeline()

  // Cible repérée hors caméra (voir scout.spec.js) : la fiche à ouvrir, le bâtiment et
  // la porte qui portent l'échange le plus long — donc le seul réellement analysé.
  // Lue ICI et non au chargement du module : Playwright importe les fichiers de test
  // pour les recenser AVANT d'exécuter le projet `scout`, si bien qu'un `const` de
  // module pourrait capter un repérage périmé, voire absent au premier lancement.
  const SCOUT = readScout()

  // ═══ 0. La barre latérale, et la vue simplifiée ══════════════════════════════
  chapter('Le menu, en version simple')
  await page.goto('/commerciaux')
  await page.waitForLoadState('domcontentloaded')
  // Attente du CONTENU et non d'un état réseau : `networkidle` n'est jamais atteint
  // sur une app qui interroge le serveur en continu, et une prise de 9 minutes ne
  // doit pas mourir sur ce détail.
  await page.locator('a[href^="/commerciaux/"]').first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(1000)

  const simple = page.getByRole('button', { name: 'Vue simple' }).first()
  if (await simple.isVisible().catch(() => false)) {
    await highlight(page, simple)
    await caption(page, 'Le menu de gauche existe en deux versions.', 3400)
    await clearCaption(page)
    await simple.click()
    await page.waitForTimeout(1600)
    await caption(page, 'La version simple ne garde que l’essentiel du quotidien.', 3800)
    await clearCaption(page)
    // On reste en vue simple pour toute la suite : c'est celle qu'on recommande.
  }

  // ═══ 1. La page Utilisateurs : une seule liste, et les rangs ═════════════════
  chapter('L’équipe et les rangs')
  //
  // On passe par l'entrée « Utilisateurs » de la vue simple, qui mène à la page
  // FUSIONNÉE. C'est important : /commerciaux ne liste que des commerciaux, et y
  // annoncer une liste commune serait faux.
  const usersEntry = page.getByRole('link', { name: /Utilisateurs/ }).first()
  if (await usersEntry.isVisible().catch(() => false)) {
    await highlight(page, usersEntry)
    await usersEntry.click()
  } else {
    await page.goto('/equipe')
  }
  await page.waitForLoadState('domcontentloaded')
  await page
    .locator('a[href^="/commerciaux/"], a[href^="/managers/"]')
    .first()
    .waitFor({ timeout: 30_000 })
  await page.waitForTimeout(1200)

  // La phrase dit ce que la page RÉUNIT, pas qui s'y trouve aujourd'hui : elle reste
  // donc vraie quand aucun manager n'est en poste, et le badge de rôle porté par
  // chaque ligne la rend vérifiable à l'image. Seule la CIBLE du surlignage dépend
  // des données — un badge « Manager » s'il en existe un, sinon « Commercial ».
  const managerBadge = page.getByText('Manager', { exact: true }).first()
  const roleBadge = (await managerBadge.isVisible().catch(() => false))
    ? managerBadge
    : page.getByText('Commercial', { exact: true }).first()
  if (await roleBadge.isVisible().catch(() => false)) {
    await highlight(page, roleBadge, 1400)
  }

  await caption(
    page,
    'Cette page réunit toute l’équipe : commerciaux et managers, chacun avec son rôle.',
    5000
  )
  await clearCaption(page)

  const firstRow = page.locator('a[href^="/commerciaux/"], a[href^="/managers/"]').first()
  await highlight(page, firstRow, 1400)
  await caption(page, 'Chaque ligne montre le palier, le rang, les points et les contrats.', 4800)
  await clearCaption(page)

  // D'où vient « Vu le … » : la question revient systématiquement.
  await caption(page, '« Vu le… » n’est pas une connexion.', 4400)
  await clearCaption(page)
  await caption(page, 'C’est la dernière porte que la personne a renseignée sur le terrain.', 5000)
  await clearCaption(page)
  await caption(page, 'Sans activité, c’est que rien n’a encore été renseigné.', 4800)
  await clearCaption(page)

  const tiers = page.getByText('Paliers de rang').first()
  await highlight(page, tiers, 1400)
  await caption(page, 'À droite, les paliers, et les points qu’il faut pour chacun.', 4200)
  await clearCaption(page)

  await caption(page, 'Les points viennent uniquement des contrats validés.', 4800)
  await clearCaption(page)

  await caption(
    page,
    'Donc « Non classé » veut dire aucun contrat validé — pas une absence de travail.',
    4600
  )
  await clearCaption(page)

  const statusFilter = page.getByRole('combobox').first()
  await highlight(page, statusFilter)
  await statusFilter.click()
  await page.waitForTimeout(1000)
  await caption(page, 'Par défaut, on ne voit que les personnes encore en poste.', 3800)
  await clearCaption(page)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(700)

  await caption(page, 'Le reste se comprend en ouvrant une fiche.', 3600)
  await clearCaption(page)

  // ═══ 2. La fiche ═════════════════════════════════════════════════════════════
  chapter('La fiche d’une personne')
  if (SCOUT?.href) {
    await page.goto(SCOUT.href)
  } else {
    await page.locator('a[href^="/commerciaux/"]').first().click()
  }
  await page.waitForLoadState('domcontentloaded')
  await page.getByRole('tab', { name: 'Bâtiments' }).first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(1400)

  const sessions = page.getByRole('button', { name: /session.*analysée/i }).first()
  const hasCoaching = await sessions.isVisible().catch(() => false)

  await caption(page, 'La fiche rassemble tout sur une personne.', 3800)
  await clearCaption(page)

  // ═══ 3. Bâtiments : la clé — adresse → façade → porte ════════════════════════
  chapter('Les bâtiments, porte par porte')
  const ongletBatiments = page.getByRole('tab', { name: 'Bâtiments' }).first()
  if (await ongletBatiments.isVisible().catch(() => false)) {
    await highlight(page, ongletBatiments)
    await ongletBatiments.click()
    await page.waitForTimeout(1500)
  }

  await caption(page, 'On commence par les bâtiments : c’est là que tout se passe.', 4200)
  await clearCaption(page)
  await caption(page, 'Une ligne par adresse visitée, avec sa couverture.', 4400)
  await clearCaption(page)
  await caption(page, 'La couverture, ce sont les portes faites sur le total de l’immeuble.', 4800)
  await clearCaption(page)
  await caption(page, 'Chaque adresse s’ouvre, et c’est là que ça devient intéressant.', 4000)
  await clearCaption(page)

  // Ouverture directe du bâtiment repéré : c'est celui qui contient l'échange long.
  const rows = page.locator('table tbody tr')
  await rows.nth(SCOUT?.rowIndex ?? 0).click()
  await page.waitForTimeout(1900)

  const facade = page.locator('[role="dialog"]').first()
  const longPill = facade.getByRole('button', { name: /> 3min/ }).first()
  const hasLongPill = await longPill.isVisible().catch(() => false)

  await caption(page, 'L’immeuble vu de face : une ligne par étage, une case par porte.', 4600)
  await clearCaption(page)
  await caption(
    page,
    'La couleur dit ce qui s’est passé : contrat, rendez-vous, refus, absent.',
    4600
  )
  await clearCaption(page)
  await caption(
    page,
    'Les petites barres veulent dire qu’une conversation a été enregistrée.',
    4200
  )
  await clearCaption(page)
  await caption(page, 'On peut n’afficher qu’un résultat, ou que les conversations longues.', 4400)
  await clearCaption(page)

  // Filtrer sur les échanges longs : ce sont eux qui portent une analyse complète.
  // Un audio de quelques secondes ressort « Inexploitable », sans score ni résumé.
  if (hasLongPill) {
    await highlight(page, longPill)
    await longPill.click()
    await page.waitForTimeout(1500)
    await caption(page, 'Les conversations longues sont les plus intéressantes à écouter.', 4800)
    await clearCaption(page)
  }

  // La porte repérée, désignée par son `title` (« Porte 503 — audio 16:21 »).
  const door = SCOUT?.doorTitle
    ? facade.locator(`button[title="${SCOUT.doorTitle}"]`).first()
    : facade.locator('button[title*="audio"]').first()
  const hasDoor = await door.isVisible().catch(() => false)

  if (hasDoor && door) {
    await highlight(page, door, 1600)
    await caption(page, 'On ouvre une porte où la conversation a été enregistrée.', 4200)
    await clearCaption(page)
    await door.click()
    await page.waitForTimeout(2600)

    await caption(page, 'On est au plus près du terrain : une porte, une conversation.', 4200)
    await clearCaption(page)
    await caption(page, 'En haut : l’étage, l’adresse, le résultat et la date du passage.', 4800)
    await clearCaption(page)

    const porte = page.locator('[role="dialog"]').last()

    const enregistrement = porte.getByText('Enregistrement', { exact: true }).first()
    if (await seen(enregistrement, 'section Enregistrement')) {
      await highlight(page, enregistrement, 1400)
      await caption(page, 'La conversation s’écoute directement ici.', 4400)
      await clearCaption(page)
    }

    const coachingIA = porte.getByText('Coaching IA', { exact: true }).first()
    if (await seen(coachingIA, 'section Coaching IA')) {
      await highlight(page, coachingIA, 1400)
      await caption(page, 'Juste en dessous, l’analyse de cette conversation.', 4400)
      await clearCaption(page)

      // D'OÙ VIENT CETTE ANALYSE — le point le plus mal compris du produit.
      // Côté mobile, enregistrer le résultat d'une porte arrête la prise et envoie
      // l'audio ; à la confirmation, le backend met l'analyse en file tout seul
      // (recording.service.ts → coaching.enqueue). Trois filtres la conditionnent,
      // tous réglables en base : statut coachable (REFUS, ARGUMENTE,
      // RENDEZ_VOUS_PRIS, CONTRAT_SIGNE par défaut), durée ≥ 120 s, et un plan de
      // vente actif.
      await caption(page, 'Personne ne l’a demandée : elle s’est lancée toute seule.', 4600)
      await clearCaption(page)
      await caption(page, 'Sur le mobile, le commercial enregistre le résultat de la porte.', 4800)
      await clearCaption(page)
      await caption(page, 'L’audio remonte alors, et l’analyse démarre sans intervention.', 4800)
      await clearCaption(page)
      await caption(page, 'Trois conditions, toutes réglables dans Coaching IA.', 4400)
      await clearCaption(page)
      await caption(
        page,
        'Le résultat doit être refus, argumenté, rendez-vous pris ou contrat signé.',
        5000
      )
      await clearCaption(page)
      await caption(
        page,
        'Un « absent » n’est donc jamais analysé : il n’y a rien à coacher.',
        5000
      )
      await clearCaption(page)
      await caption(page, 'Il faut aussi au moins deux minutes de conversation.', 4600)
      await clearCaption(page)
      await caption(page, 'Et un plan de vente actif, qui sert de grille de lecture.', 4800)
      await clearCaption(page)
      await caption(page, 'C’est ce qui explique les portes marquées « non analysé ».', 4800)
      await clearCaption(page)

      // Le Favori : métadonnée de coaching, sert à retrouver un échange marquant.
      // Nom ACCESSIBLE et non texte visible : le bouton porte un aria-label
      // (« Ajouter aux favoris » / « Retirer des favoris ») qui remplace son libellé
      // « Favori ». D'où la casse ignorée et le radical volontairement court.
      const favori = porte.getByRole('button', { name: /favori/i }).first()
      if (await seen(favori, 'bouton Favori')) {
        await highlight(page, favori, 1600)
        await caption(page, 'L’étoile met de côté une conversation remarquable.', 4400)
        await clearCaption(page)
        await caption(page, 'On la retrouve ensuite avec le filtre « Favoris ».', 4400)
        await clearCaption(page)
        // Le favori se voit aussi : `favori-glow` pose une bordure dorée animée sur la
        // tuile de porte, la session analysée ET la ligne d'enregistrement.
        await caption(page, 'Un favori se reconnaît à sa bordure dorée.', 4400)
        await clearCaption(page)
        await caption(page, 'Elle apparaît partout : sur la porte, comme dans les listes.', 4800)
        await clearCaption(page)
      }

      const relancer = porte.getByRole('button', { name: /Relancer|Lancer l’analyse/ }).first()
      if (await seen(relancer, 'bouton Relancer')) {
        await highlight(page, relancer, 1600)
        await caption(page, 'Et ce bouton force l’analyse, en dehors de ces règles.', 4800)
        await clearCaption(page)
      }
    }

    // Un échange court n'a NI score NI résumé NI plan de vente : on ne décrit que ce
    // qui est réellement à l'écran, et on explique le cas au lieu de l'inventer.
    const inexploitable = await porte
      .getByText(/inexploitable/i)
      .first()
      .isVisible()
      .catch(() => false)

    if (inexploitable) {
      await caption(
        page,
        'Ici la conversation fait moins de deux minutes : pas d’analyse automatique.',
        5000
      )
      await clearCaption(page)
    } else {
      await caption(page, 'Une note sur 100 résume la conversation.', 4200)
      await clearCaption(page)

      await page.mouse.wheel(0, 500)
      await page.waitForTimeout(1700)

      if (
        await porte
          .getByText('Résumé', { exact: true })
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        await caption(page, 'Un résumé de ce qui s’est dit, puis le texte complet.', 4400)
        await clearCaption(page)
      }

      if (
        await porte
          .getByText('Forces')
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        await caption(page, 'Ce qui a bien marché, ce qui peut progresser, et des conseils.', 4600)
        await clearCaption(page)
      }

      await page.mouse.wheel(0, 600)
      await page.waitForTimeout(1700)

      const plan = porte.getByText('Déroulé du plan de vente').first()
      if (await plan.isVisible().catch(() => false)) {
        await highlight(page, plan, 1400)
        await caption(
          page,
          'Et le plan de vente : quelles étapes ont été suivies, ou oubliées.',
          4800
        )
        await clearCaption(page)
      }

      await caption(page, 'Une conversation de quelques secondes, elle, n’est pas notée.', 4800)
      await clearCaption(page)
    }

    await page.mouse.wheel(0, 600)
    await page.waitForTimeout(1600)

    if (
      await porte
        .getByText(/Historique de la Porte/)
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await caption(page, 'Et l’historique de la porte : chaque passage, et par qui.', 4800)
      await clearCaption(page)
    }

    // Fermer la porte, puis la façade (modals imbriqués).
    await page.keyboard.press('Escape')
    await page.waitForTimeout(1200)
  }

  await page.keyboard.press('Escape')
  await page.waitForTimeout(1400)

  // ═══ 4. La liaison : du porte-à-porte au bilan global ════════════════════════
  chapter('Le bilan coaching')
  const synthese = page.getByText('Synthèse coaching').first()
  if (await synthese.isVisible().catch(() => false)) {
    await highlight(page, synthese, 1600)
    await caption(page, 'Maintenant, la même chose, mais vue dans son ensemble.', 4400)
    await clearCaption(page)
    await caption(page, 'Le bilan rassemble toutes ces conversations, porte par porte.', 4600)
    await clearCaption(page)
    await caption(page, 'Une conversation montre un moment ; le bilan montre les habitudes.', 4800)
    await clearCaption(page)
    await caption(page, 'Une note moyenne, une tendance, et la période concernée.', 4200)
    await clearCaption(page)
    await caption(
      page,
      'Puis le détail, les points forts, et sur quoi travailler en premier.',
      4800
    )
    await clearCaption(page)
  }

  if (hasCoaching && sessions) {
    await highlight(page, sessions)
    await caption(page, 'Le nombre de conversations analysées est cliquable.', 4400)
    await clearCaption(page)
    await sessions.click()
    await page.waitForTimeout(2400)

    const dialog = page.locator('[role="dialog"]').first()

    await caption(page, 'On y retrouve toutes les conversations prises en compte.', 4200)
    await clearCaption(page)
    await caption(page, 'Chaque ligne affiche sa note.', 4200)
    await clearCaption(page)

    // Le tiret n'est PAS un échec : l'analyse a tourné (status READY) mais s'est
    // déclarée INEXPLOITABLE, donc `score: null` — durée sous le minimum, ou
    // transcription quasi vide. Voir analysis-runner.service.ts → markInexploitable.
    await caption(page, 'Un tiret au lieu d’une note n’est pas une erreur.', 4600)
    await clearCaption(page)
    await caption(page, 'La conversation a bien été analysée, mais rien à juger.', 4800)
    await clearCaption(page)
    await caption(page, 'Trop courte, ou presque rien de dit : aucune note fiable.', 5000)
    await clearCaption(page)

    // Tri par score DESCENDANT avant d'ouvrir : les échanges trop courts remontent
    // « Inexploitable », sans résumé ni plan de vente, et les légendes décriraient
    // alors un contenu absent de l'écran.
    const triBy = dialog.getByRole('combobox').first()
    if (await triBy.isVisible().catch(() => false)) {
      await highlight(page, triBy)
      await triBy.click()
      await page.waitForTimeout(900)
      const scoreOpt = page.getByRole('option', { name: 'Score' }).first()
      if (await scoreOpt.isVisible().catch(() => false)) {
        await scoreOpt.click()
        await page.waitForTimeout(1500)
        await caption(page, 'On peut mettre les meilleures notes en premier.', 4400)
        await clearCaption(page)
      } else {
        await page.keyboard.press('Escape')
        await page.waitForTimeout(600)
      }
    }

    await caption(page, 'Chaque ligne rouvre la conversation, avec son analyse.', 4400)
    await clearCaption(page)

    // « + Ajouter des audios » : on MONTRE le lancement, on ne le déclenche pas.
    const ajouter = page.getByRole('button', { name: /Ajouter des audios/ }).first()
    if (await ajouter.isVisible().catch(() => false)) {
      await highlight(page, ajouter)
      await ajouter.click()
      await page.waitForTimeout(2400)

      await caption(page, 'L’autre onglet montre tous les enregistrements de la personne.', 4400)
      await clearCaption(page)
      await caption(
        page,
        'On peut chercher, ou filtrer par résultat, par durée, ou sur ce qui reste à analyser.',
        4800
      )
      await clearCaption(page)

      const lancer = page.getByRole('button', { name: /^Lancer$/ }).first()
      if (await lancer.isVisible().catch(() => false)) {
        await highlight(page, lancer, 1600)
        await caption(page, '« Lancer » force l’analyse d’un enregistrement resté de côté.', 4800)
        await clearCaption(page)
      }

      // Case à cocher d'UNE LIGNE, jamais l'en-tête « Tout sélectionner (page) » :
      // celle-ci armerait un « Lancer l'analyse (15) » sur toute la page, et on ne
      // laisse pas une commande de masse armée à l'écran dans un tutoriel.
      const box = page.locator('[role="dialog"] li input[type="checkbox"]').first()
      if (await box.isVisible().catch(() => false)) {
        await highlight(page, box)
        await box.check().catch(() => {})
        await page.waitForTimeout(1400)
        await caption(page, 'Ou on en coche plusieurs, pour tout lancer d’un coup.', 4400)
        await clearCaption(page)
        await box.uncheck().catch(() => {})
        await page.waitForTimeout(800)
      }

      await caption(
        page,
        'L’analyse se fait toute seule, puis la conversation rejoint la liste.',
        4800
      )
      await clearCaption(page)
      await caption(page, 'Un rappel propose alors de mettre le bilan à jour.', 4800)
      await clearCaption(page)
    }

    await page.keyboard.press('Escape')
    await page.waitForTimeout(1600)
  }

  // ═══ 5. Les autres onglets ═══════════════════════════════════════════════════
  chapter('Perf, contrats et terrain')
  await caption(page, 'Les trois autres onglets complètent le tout.', 4000)
  await clearCaption(page)

  const perf = page.getByRole('tab', { name: /Perf/ }).first()
  if (await perf.isVisible().catch(() => false)) {
    await highlight(page, perf)
    await perf.click()
    await page.waitForTimeout(1700)
    await caption(page, 'Perf & prospection : rendez-vous, argumentés, refus, absents.', 4600)
    await clearCaption(page)
    await caption(page, 'Ce sont les couleurs de l’immeuble, simplement comptées.', 4800)
    await clearCaption(page)
    await page.mouse.wheel(0, 500)
    await page.waitForTimeout(1700)
    await caption(page, 'Les graphiques montrent ce que sont devenues les portes frappées.', 4600)
    await clearCaption(page)
    await page.mouse.wheel(0, -500)
    await page.waitForTimeout(900)
  }

  const contrats = page.getByRole('tab', { name: 'Contrats' }).first()
  if (await contrats.isVisible().catch(() => false)) {
    await highlight(page, contrats)
    await contrats.click()
    await page.waitForTimeout(1700)
    await caption(page, 'Contrats : les contrats validés, offre par offre.', 4200)
    await clearCaption(page)
  }

  const terrain = page.getByRole('tab', { name: 'Terrain' }).first()
  if (await terrain.isVisible().catch(() => false)) {
    await highlight(page, terrain)
    await terrain.click()
    // On attend le dessin effectif de la carte, pas un délai arbitraire : sinon la
    // légende commente un cadre encore vide.
    await waitForMaps(page)
    await page.waitForTimeout(800)
    await caption(page, 'Terrain : la zone en cours, les zones passées, et les trajets.', 4800)
    await clearCaption(page)
    await page.mouse.wheel(0, 600)
    await waitForMaps(page)
    await page.waitForTimeout(1200)
    await caption(page, 'Les trajets permettent de vérifier une journée sur le terrain.', 4600)
    await clearCaption(page)
    await page.mouse.wheel(0, -600)
    await page.waitForTimeout(1000)
  }

  // ═══ 6. En haut : les chiffres clés, puis le filtre et sa portée ═════════════
  chapter('Les chiffres clés et la période')
  const signes = page.getByText('Contrats signés').first()
  if (await signes.isVisible().catch(() => false)) {
    await highlight(page, signes, 1500)
    await caption(page, 'Tout en haut, quatre chiffres résument la période.', 4000)
    await clearCaption(page)
    await caption(
      page,
      'Signés : annoncés sur le terrain. Validés : confirmés après vérification.',
      5000
    )
    await clearCaption(page)
    await caption(page, 'L’écart entre les deux se voit donc tout de suite.', 4200)
    await clearCaption(page)
  }

  const contact = page.getByText('Infos de contact').first()
  if (await contact.isVisible().catch(() => false)) {
    await highlight(page, contact)
    await contact.click()
    await page.waitForTimeout(1300)
    await caption(page, 'Les coordonnées se déplient au besoin, et se replient.', 3800)
    await clearCaption(page)
    await contact.click()
    await page.waitForTimeout(800)
  }

  const periode = page
    .getByRole('button', { name: /Toutes les périodes|\d{2}\/\d{2}\/\d{4}/ })
    .first()

  if (await periode.isVisible().catch(() => false)) {
    await highlight(page, periode)
    await caption(page, 'Et pour finir, le choix de la période, en haut à droite.', 4200)
    await clearCaption(page)

    await periode.click()
    await page.waitForTimeout(1200)
    await caption(page, 'Des raccourcis, ou deux dates à choisir soi-même.', 4400)
    await clearCaption(page)

    const appliquer = page.getByRole('button', { name: 'Appliquer' }).first()
    if (await appliquer.isVisible().catch(() => false)) {
      await highlight(page, appliquer)
      await caption(page, 'Un raccourci part tout seul ; deux dates demandent « Appliquer ».', 4600)
      await clearCaption(page)
    }

    await caption(page, 'Il choisit la période sur laquelle les chiffres sont calculés.', 4600)
    await clearCaption(page)
    await caption(page, 'Si rien ne s’est passé sur la période, les chiffres tombent à zéro.', 5000)
    await clearCaption(page)
    await caption(page, 'Les enregistrements et les analyses, eux, restent toujours là.', 4800)
    await clearCaption(page)

    // On ne l'applique PAS : les données de staging sont anciennes, et la dernière
    // image de la vidéo doit rester une fiche pleine, pas une fiche à zéro.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(900)
  }

  await caption(page, 'La porte, la conversation, le bilan : c’est l’ordre à suivre.', 5000)
  await clearCaption(page)
  await page.waitForTimeout(900)
})
