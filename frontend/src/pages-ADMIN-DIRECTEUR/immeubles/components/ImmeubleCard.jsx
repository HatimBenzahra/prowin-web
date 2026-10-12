import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Building2, Layers, Trash2 } from 'lucide-react'
import { BuildingTypeBadge } from '@/components/BuildingTypeBadge'
import { couvertureBarClass } from '../immeubles-display'

/**
 * Un bâtiment en card, pour la vue « Cartes » de la page Bâtiments.
 *
 * La bordure reste neutre en toutes circonstances : la sémantique passe par les
 * points de statut et le badge de type, jamais par la bordure de la card — même
 * règle que `BuildingFacade`.
 *
 * `total_doors` est la grille déclarée (nbEtages × nbPortesParEtage), pas le nombre
 * de portes créées : c'est la base de la couverture, calculée en amont par
 * `buildingDoorCount`.
 */

function Metric({ dotClass, value, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
      <span className="tabular-nums font-medium text-foreground">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  )
}

export default function ImmeubleCard({ immeuble, canDelete, onDelete }) {
  const couverture = immeuble.couverture ?? 0

  return (
    <Card className="group relative gap-0 py-0 transition-shadow duration-200 hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <Link
            to={`/immeubles/${immeuble.id}`}
            className="min-w-0 flex-1 text-sm font-semibold leading-snug hover:text-primary hover:underline"
          >
            {immeuble.address}
          </Link>
          <BuildingTypeBadge immeuble={immeuble} className="shrink-0" />
        </div>

        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span className="truncate">{immeuble.commercial_name}</span>
          <span aria-hidden="true">·</span>
          <span className="flex items-center gap-1 whitespace-nowrap">
            <Layers className="h-3 w-3" />
            {immeuble.floors} ét.
          </span>
          <span aria-hidden="true">·</span>
          <span className="flex items-center gap-1 whitespace-nowrap">
            <Building2 className="h-3 w-3" />
            {immeuble.total_doors} porte{immeuble.total_doors > 1 ? 's' : ''}
          </span>
        </p>

        <div className="mt-3 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${couvertureBarClass(couverture)}`}
              style={{ width: `${couverture}%` }}
            />
          </div>
          <span className="w-11 text-right text-xs tabular-nums text-muted-foreground">
            {couverture}%
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <Metric
            dotClass="bg-emerald-500"
            value={immeuble.contrats_signes}
            label={`contrat${immeuble.contrats_signes > 1 ? 's' : ''}`}
          />
          <Metric dotClass="bg-blue-500" value={immeuble.rdvCount} label="RDV" />
          <Metric
            dotClass="bg-muted-foreground/40"
            value={immeuble.nonVisiteCount}
            label="non visités"
          />
        </div>

        {canDelete && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Supprimer ${immeuble.address}`}
            onClick={() => onDelete(immeuble.id)}
            className="absolute right-2 bottom-2 h-7 w-7 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
