import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Pencil, Archive } from 'lucide-react'
import { getStatusMeta } from '@/constants/domain/user-status'

/**
 * Une personne en card pleine largeur, empilée en liste.
 *
 * Choisie plutôt qu'un tableau, qui imposait un scroll horizontal, et plutôt qu'une
 * grille de petites cards, qui écrasait l'information.
 *
 * **À partir de 1280 px, toutes les colonnes sauf l'identité ont une largeur fixe et
 * la rangée ne se replie jamais.** C'est la condition pour que palier / rang / points /
 * contrats s'alignent d'une ligne à l'autre : la version précédente laissait le bloc
 * identité en `flex-1` et poussait l'activité en `ml-auto`, si bien que « Vu 3 h » et
 * « Vu 20 juil. 2026 » décalaient les colonnes de plusieurs dizaines de pixels entre
 * deux lignes voisines. Quand la place manque, c'est le nom qui tronque.
 *
 * **En dessous de 1280 px, la rangée se replie en deux niveaux** : identité + actions,
 * puis la gamification sur toute la largeur. Une rangée d'un seul tenant coûte ~750 px
 * alors que le conteneur applicatif n'en offre que ~295 sur un téléphone (`w-11/12`
 * moins `p-6`), et il est en `overflow-x-hidden` : sans repli, points, contrats et
 * boutons n'étaient pas scrollés, ils étaient coupés. Les largeurs fixes tombent avec
 * le repli — à cette taille, tout afficher prime sur l'alignement des colonnes.
 *
 * Les infos de gamification — palier, rang, points, contrats retenus — viennent de
 * `rankInfo`, issu du snapshot backend via `toRankInfo`, jamais d'un calcul local.
 *
 * Le nom est un `Link` vers la fiche : les specs e2e s'appuient sur
 * `a[href^="/commerciaux/"]`.
 *
  return `${first}${last}`.toUpperCase() || '?'
}

/**
 * `subtle` : pour une mention textuelle (« Non classé ») plutôt qu'une valeur chiffrée.
 * `width` est imposée par l'appelant — c'est elle qui aligne la colonne entre les lignes.
 * Elle est préfixée `xl:` : sous ce seuil la colonne prend sa largeur naturelle, sans
 * quoi les quatre statistiques ne tiendraient pas sur la largeur d'un téléphone.
 */
function Stat({ label, value, subtle, width }) {
  return (
    <div className={`shrink-0 text-right ${width}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      {/* `whitespace-nowrap` sur les deux variantes : un total à cinq chiffres passait
          à la ligne dans sa colonne et faisait grandir toute la rangée. */}
      <p
        className={
          subtle
            ? 'whitespace-nowrap text-xs font-medium text-muted-foreground'
            : 'whitespace-nowrap text-sm font-semibold tabular-nums'
        }
      >
        {value}
      </p>
    </div>
  )
}

export default function PersonListCard({
  person,
  detailsPath,
  facts = [],
  showRanking = true,
  canEdit,
  onEdit,
  canArchive,
  onArchive,
}) {
  const statusMeta = getStatusMeta(person.status)
  const fullName = `${person.prenom || ''} ${person.nom || ''}`.trim() || `#${person.id}`
  // Une liste fusionnée mêle des rôles dont les fiches vivent sur des routes
  // différentes : la personne peut donc porter son propre chemin.
  const path = person.detailsPath || detailsPath
  const points = person.rankInfo?.points ?? 0
  const contrats = person.contratsRetenus ?? 0
  // Un rang parmi des scores tous nuls ne veut rien dire : on l'affiche seulement
  // quand il y a matière à classer.
  const rank = points > 0 || contrats > 0 ? person.rankInfo?.position : null

  return (
    <Card className="group gap-0 py-0 transition-shadow duration-200 hover:shadow-md">
      <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4 xl:flex-nowrap">
        <div className="order-1 flex min-w-0 flex-1 items-center gap-3 xl:order-none">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold">
            {initialsOf(person)}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link
                to={`${path}/${person.id}`}
                className="min-w-0 truncate text-sm font-semibold hover:text-primary hover:underline"
              >
                {fullName}
              </Link>
              {person.roleLabel && (
                <span className="shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {person.roleLabel}
                </span>
              )}
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusMeta.badgeClass}`}
              >
                {statusMeta.label}
              </span>
            </div>

            {facts.length > 0 && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {facts.map(fact => `${fact.label} ${fact.value || '—'}`).join(' · ')}
              </p>
            )}
          </div>
        </div>

        {showRanking && (
          <div className="order-3 flex w-full shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 xl:order-none xl:w-auto xl:flex-nowrap xl:justify-start xl:gap-3">
            {/* Largeur fixe une fois la rangée d'un seul tenant : sans elle, un palier
                « Grandmaster » décalerait les trois colonnes suivantes par rapport à
                une ligne « Bronze ». */}
            <span
              className={`inline-flex shrink-0 items-center justify-center rounded-full border px-2 py-0.5 text-[11px] font-semibold xl:w-24 ${person.rankInfo?.badgeClasses || ''}`}
            >
              {person.rankInfo?.name || '—'}
            </span>
            <Stat
              label="Rang"
              value={rank ? `#${rank}` : 'Non classé'}
              subtle={!rank}
              width="xl:w-[4.5rem]"
            />
            <Stat label="Points" value={points} width="xl:w-14" />
            <Stat label="Contrats" value={contrats} width="xl:w-16" />
          </div>
        )}

        {/* Masquée sous 1280 px, soit exactement le seuil où la rangée se replie : c'est
            la colonne la plus redondante (la date est sur la fiche), et la rangée
            complète ne tient d'un seul tenant qu'au-dessus. En dessous, le repli prend
            le relais et cette colonne n'a plus lieu d'être. */}
        <span className="hidden w-[6.5rem] shrink-0 truncate text-right text-[11px] text-muted-foreground xl:block">
          {person.lastActivityLabel ? `Vu ${person.lastActivityLabel}` : 'Aucune activité'}
        </span>

        {/* Zone d'actions toujours rendue : les boutons sont conditionnels, la largeur
            réservée ne l'est pas — sinon une ligne sans droit d'archivage serait plus
            courte et casserait l'alignement de toute la liste.

            Les boutons ne s'effacent qu'à partir de 1280 px : sous ce seuil on est au
            doigt, il n'y a pas de survol, et `group-hover` les rendait inatteignables —
            modifier et archiver étaient simplement impossibles sur mobile. */}
        <div className="order-2 ml-auto flex w-16 shrink-0 items-center justify-end gap-1 xl:order-none xl:ml-0">
          {canEdit && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Modifier ${fullName}`}
              onClick={() => onEdit(person)}
              className="h-7 w-7 shrink-0 text-muted-foreground opacity-100 transition-opacity hover:text-foreground focus-visible:opacity-100 xl:opacity-0 xl:group-hover:opacity-100"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {canArchive && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Archiver ${fullName}`}
              title="Archiver (contrat fini)"
              onClick={() => onArchive(person)}
              className="h-7 w-7 shrink-0 text-muted-foreground opacity-100 transition-opacity hover:text-foreground focus-visible:opacity-100 xl:opacity-0 xl:group-hover:opacity-100"
            >
              <Archive className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
