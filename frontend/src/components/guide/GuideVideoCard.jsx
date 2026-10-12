import { useState } from 'react'
import { PlayCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  GUIDE_CHAPTERS,
  GUIDE_DURATION_SEC,
  GUIDE_POSTER,
  formatGuideDuration,
} from './guide-video'
import GuideVideoDialog from './GuideVideoDialog'

/**
 * Carte d'appel vers le guide vidéo, pensée pour une colonne latérale.
 *
 * Elle ne lit RIEN d'elle-même : une vidéo de plusieurs minutes n'a pas sa place dans
 * une colonne de 320 px, et une lecture automatique serait subie. Un clic ouvre la
 * modale, qui porte le lecteur.
 *
 * Vignette, durée et sommaire viennent du bundle : rien à charger, donc aucun état de
 * chargement ni cas d'échec à traiter.
 */
export default function GuideVideoCard() {
  const [open, setOpen] = useState(false)
  const duration = formatGuideDuration(GUIDE_DURATION_SEC)

  return (
    <>
      <Card className="gap-0 py-0">
        <CardHeader className="px-4 pt-4 pb-3">
          <CardTitle className="text-sm font-semibold">Comment lire ces données</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Le parcours complet, de la porte au bilan.
          </p>
        </CardHeader>

        <CardContent className="px-4 pt-0 pb-4">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group relative block w-full overflow-hidden rounded-lg border border-border/60 bg-muted/40 transition-colors hover:border-primary/40"
            aria-label="Lire le guide vidéo"
          >
            {/* Vignette : évite le rectangle noir d'un `<video>` non chargé. */}
            <img
              src={GUIDE_POSTER}
              alt=""
              className="aspect-video w-full object-cover object-left-top"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-slate-900/30 transition-colors group-hover:bg-slate-900/40">
              <PlayCircle className="h-10 w-10 text-white drop-shadow" />
            </span>
            {duration && (
              <span className="absolute right-2 bottom-2 rounded bg-slate-900/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
                {duration}
              </span>
            )}
          </button>

          {GUIDE_CHAPTERS.length > 0 && (
            <ol className="mt-3 space-y-1">
              {GUIDE_CHAPTERS.map(chapter => (
                <li
                  key={chapter.atSec}
                  className="flex items-baseline gap-2 text-[11px] leading-relaxed text-muted-foreground"
                >
                  <span className="text-foreground/40">•</span>
                  <span>{chapter.title}</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <GuideVideoDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
