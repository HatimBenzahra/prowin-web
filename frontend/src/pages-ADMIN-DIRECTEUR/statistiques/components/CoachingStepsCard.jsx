import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatNumber } from '../stats-format'

/**
 * Profil d'un intervenant par étape du plan de vente, face à la moyenne d'équipe.
 *
 * Forme : **dumbbell**. Deux valeurs par catégorie (l'intervenant, l'équipe) sur une
 * même piste 0–100, reliées par un segment dont la longueur *est* l'écart. C'est ce
 * que la table des formes prescrit pour « deux valeurs par item », et c'est ce qui
 * rend l'information actionnable : on ne veut pas savoir qu'un commercial est à 62,
 * on veut savoir sur quelle étape il décroche.
 *
 * Un radar a été écarté : la forme n'est pas dans le répertoire recommandé, les aires
 * y déforment les écarts et l'ordre des axes crée des motifs qui ne veulent rien dire.
 *
 * Les étapes non applicables à un échange n'entrent pas dans sa moyenne (le backend
 * ne compte que `applicable`), donc `nbAnalyses` peut varier d'une étape à l'autre —
 * il est affiché pour cette raison.
 */
export default function CoachingStepsCard({ scoreboard, loading }) {
  const rows = useMemo(() => scoreboard?.rows || [], [scoreboard])
  const [selected, setSelected] = useState('equipe')

  // Mémoïsé : `scoreboard?.stepsEquipe || []` crée un tableau neuf à chaque rendu,
  // ce qui invaliderait la dépendance du useMemo ci-dessous en permanence.
  const stepsEquipe = useMemo(() => scoreboard?.stepsEquipe || [], [scoreboard])
  const selectedRow = rows.find(row => `${row.subjectRole}:${row.subjectId}` === selected) || null

  const lignes = useMemo(() => {
    if (!stepsEquipe.length) return []

    const parCle = new Map((selectedRow?.steps || []).map(step => [step.key, step]))

    return stepsEquipe.map(stepEquipe => {
      const stepSujet = selectedRow ? parCle.get(stepEquipe.key) : null
      return {
        key: stepEquipe.key,
        label: stepEquipe.label,
        weight: stepEquipe.weight,
        scoreEquipe: stepEquipe.score,
        nbAnalysesEquipe: stepEquipe.nbAnalyses,
        scoreSujet: stepSujet?.score ?? null,
        nbAnalysesSujet: stepSujet?.nbAnalyses ?? 0,
      }
    })
  }, [stepsEquipe, selectedRow])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profil par étape du plan de vente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[0, 1, 2, 3, 4].map(row => (
            <Skeleton key={row} className="h-9 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Profil par étape du plan de vente</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Où se gagne et où se perd le score, étape par étape
            </p>
          </div>
          {rows.length > 0 && (
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="equipe">Moyenne d’équipe seule</SelectItem>
                {rows.map(row => (
                  <SelectItem
                    key={`${row.subjectRole}-${row.subjectId}`}
                    value={`${row.subjectRole}:${row.subjectId}`}
                  >
                    {row.subjectName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {lignes.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Aucun plan de vente actif ou aucune analyse notée sur cette période
          </p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/60" />
                <span className="text-muted-foreground">Moyenne d’équipe</span>
              </span>
              {selectedRow && (
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                  <span className="text-muted-foreground">{selectedRow.subjectName}</span>
                </span>
              )}
            </div>

            <div className="space-y-4">
              {lignes.map(ligne => (
                <StepDumbbell key={ligne.key} ligne={ligne} hasSubject={Boolean(selectedRow)} />
              ))}
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Le poids indique la part de l’étape dans le score global. Une étape non applicable à
              un échange n’entre pas dans sa moyenne, d’où un nombre d’analyses variable selon
              l’étape.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Une étape : piste 0–100, point gris pour l'équipe, point accentué pour le sujet,
 * segment entre les deux = l'écart. L'identité vient du libellé et de la légende,
 * jamais de la couleur seule.
 */
function StepDumbbell({ ligne, hasSubject }) {
  const { label, weight, scoreEquipe, scoreSujet, nbAnalysesSujet, nbAnalysesEquipe } = ligne

  const clamp = value => Math.min(Math.max(value ?? 0, 0), 100)
  const equipePct = clamp(scoreEquipe)
  const sujetPct = clamp(scoreSujet)
  const ecart =
    hasSubject && scoreSujet != null && scoreEquipe != null
      ? Math.round((scoreSujet - scoreEquipe) * 10) / 10
      : null

  const segmentLeft = Math.min(equipePct, sujetPct)
  const segmentWidth = Math.abs(sujetPct - equipePct)
  const showSegment = hasSubject && scoreSujet != null && scoreEquipe != null

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-sm font-medium">{label}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">poids {weight}</span>
        </span>
        <span className="shrink-0 text-sm tabular-nums">
          {hasSubject ? (
            scoreSujet == null ? (
              <span className="text-muted-foreground">non évaluée</span>
            ) : (
              <>
                <span className="font-semibold">{formatNumber(scoreSujet, 1)}</span>
                <span className="text-muted-foreground">
                  {' '}
                  vs {scoreEquipe == null ? '—' : formatNumber(scoreEquipe, 1)}
                </span>
                {ecart != null && ecart !== 0 && (
                  <span
                    className={`ml-1.5 font-semibold ${
                      ecart > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
                    }`}
                  >
                    {new Intl.NumberFormat('fr-FR', {
                      maximumFractionDigits: 1,
                      signDisplay: 'always',
                    }).format(ecart)}
                  </span>
                )}
              </>
            )
          ) : (
            <span className="font-semibold">
              {scoreEquipe == null ? '—' : formatNumber(scoreEquipe, 1)}
            </span>
          )}
        </span>
      </div>

      <div className="relative mt-2 h-3">
        <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-muted/60" />

        {showSegment && segmentWidth > 0 && (
          <div
            className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary/35"
            style={{ left: `${segmentLeft}%`, width: `${segmentWidth}%` }}
          />
        )}

        {scoreEquipe != null && (
          <span
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-muted-foreground/60"
            style={{ left: `${equipePct}%` }}
            title={`Équipe : ${formatNumber(scoreEquipe, 1)} sur ${nbAnalysesEquipe} analyse${nbAnalysesEquipe > 1 ? 's' : ''}`}
          />
        )}

        {hasSubject && scoreSujet != null && (
          <span
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary"
            style={{ left: `${sujetPct}%` }}
            title={`${formatNumber(scoreSujet, 1)} sur ${nbAnalysesSujet} analyse${nbAnalysesSujet > 1 ? 's' : ''}`}
          />
        )}
      </div>
    </div>
  )
}
