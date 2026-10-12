import { useMemo } from 'react'
import { useContratsByCommercial } from '@/hooks/metier/api/gamification'
import { Badge } from '@/components/ui/badge'
import { FileSignature, Loader2 } from 'lucide-react'
import { formatDateFr } from '@/lib/format-date'
import { getOffreLogoUrl } from '@/lib/winleadplus'

/**
 * Contrats réellement signés d'un commercial, source WinLeadPlus (confirmés par
 * le service de gestion — plus fiables que le compteur ProWin issu des portes).
 * Liste compacte, aucune carte lourde. Données via le hook existant (cache VALIDE).
 */
export default function CommercialContratsSection({ commercialId }) {
  const { data: contrats = [], loading } = useContratsByCommercial(commercialId)

  const sorted = useMemo(() => {
    return [...(contrats || [])].sort((a, b) => {
      const da = new Date(a.dateValidation || a.dateSignature || 0).getTime()
      const db = new Date(b.dateValidation || b.dateSignature || 0).getTime()
      return db - da
    })
  }, [contrats])

  const totalPoints = useMemo(
    () => sorted.reduce((sum, c) => sum + (c.offrePoints || 0), 0),
    [sorted]
  )

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Chargement des contrats WinLeadPlus...
      </div>
    )
  }

  if (sorted.length === 0) {
    return (
      <div className="rounded-lg border border-border/40 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
        Aucun contrat WinLeadPlus pour ce commercial.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground">{sorted.length}</span> contrat
          {sorted.length > 1 ? 's' : ''} confirmé{sorted.length > 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-3">
          {totalPoints > 0 && (
            <span>
              <span className="font-semibold text-foreground">{totalPoints}</span> pts
            </span>
          )}
        </div>
      </div>

      <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
        {sorted.map(contrat => {
          const date = formatDateFr(contrat.dateValidation || contrat.dateSignature)
          const statutAnormal = contrat.statutContrat && contrat.statutContrat !== 'Validé'
          return (
            <div
              key={contrat.id}
              className="flex items-center gap-3 rounded-lg border border-border/60 bg-card p-3"
            >
              {contrat.offreLogoUrl ? (
                <img
                  src={getOffreLogoUrl(contrat.offreLogoUrl)}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-md border border-border/50 bg-background object-contain p-0.5"
                />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/50 bg-muted/60 text-primary">
                  <FileSignature className="h-4 w-4" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">
                    {contrat.offreNom || 'Offre inconnue'}
                  </span>
                  {statutAnormal && (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {contrat.statutContrat}
                    </Badge>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {[contrat.offreFournisseur, contrat.offreCategorie].filter(Boolean).join(' · ') ||
                    '—'}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-xs font-medium tabular-nums">{date ?? '—'}</p>
                {contrat.offrePoints != null && (
                  <p className="text-[11px] tabular-nums text-muted-foreground">
                    {contrat.offrePoints} pts
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
