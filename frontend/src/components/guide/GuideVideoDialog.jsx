import { useCallback, useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  GUIDE_CHAPTERS,
  GUIDE_POSTER,
  GUIDE_VIDEO,
  findChapterStart,
  formatChapterStart,
} from './guide-video'

/**
 * Lecteur du guide vidéo, en modale.
 *
 * Volontairement bâti sur `<video controls>` : la vidéo est un asset du bundle, aucune
 * bibliothèque de lecture n'est nécessaire.
 *
 * Les chapitres sont une liste MAISON et non les chapitres du mp4 : un élément
 * `<video>` ne les expose pas. Ils sont appliqués en déplaçant `currentTime`.
 *
 * `startAtChapter` (une expression régulière sur le titre) ouvre droit au bon endroit.
 * La résolution se fait ICI, pour qu'une fiche n'ait pas à connaître un instant.
 */
export default function GuideVideoDialog({ open, onOpenChange, startAtChapter, title }) {
  const videoRef = useRef(null)
  const seekedRef = useRef(false)
  const [currentSec, setCurrentSec] = useState(0)

  // Réarmement à la fermeture, sinon une réouverture ne repositionnerait plus.
  useEffect(() => {
    if (!open) {
      seekedRef.current = false
      setCurrentSec(0)
    }
  }, [open])

  const seekTo = useCallback(seconds => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = seconds
    void video.play().catch(() => {})
  }, [])

  /**
   * Positionnement initial. Le sommaire étant une valeur du bundle, il ne reste qu'une
   * condition à attendre : la durée doit être connue. Avant `loadedmetadata`, écrire
   * `currentTime` est ignoré par le navigateur.
   */
  const handleLoadedMetadata = () => {
    if (seekedRef.current || !startAtChapter) return
    seekedRef.current = true
    const start = findChapterStart(GUIDE_CHAPTERS, startAtChapter)
    if (start > 0) seekTo(start)
  }

  const activeIndex = GUIDE_CHAPTERS.reduce(
    (found, chapter, index) => (currentSec >= chapter.atSec ? index : found),
    -1
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `max-w-7xl` (1280 px) cadre exactement la largeur native de la vidéo : elle
          s'affiche donc au plus grand sans jamais être suréchantillonnée. */}
      <DialogContent className="flex max-h-[94vh] w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-7xl">
        <DialogHeader className="border-b p-5 pb-4">
          <DialogTitle className="text-base">{title ?? 'Comment lire ces données'}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Le parcours complet : l’équipe, une fiche, une porte, puis le bilan coaching.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4">
          <video
            ref={videoRef}
            src={GUIDE_VIDEO}
            poster={GUIDE_POSTER}
            controls
            preload="metadata"
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={event => setCurrentSec(event.currentTarget.currentTime)}
            /* `max-h` borne la hauteur SANS rien rogner sur un grand écran : à 1280 px
               de large, la vidéo fait 702 px de haut, donc sous les 68 vh d'un écran
               1080 p. Sur un portable plus bas, elle se réduit au lieu de repousser les
               contrôles sous la ligne de flottaison — le fond noir masque le
               letterboxing, et on n'a jamais à défiler pour atteindre la lecture. */
            className="max-h-[68vh] w-full rounded-lg bg-black object-contain"
          />

          {GUIDE_CHAPTERS.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Chapitres
              </p>
              <ul className="space-y-1">
                {GUIDE_CHAPTERS.map((chapter, index) => (
                  <li key={chapter.atSec}>
                    <button
                      type="button"
                      onClick={() => seekTo(chapter.atSec)}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                        index === activeIndex
                          ? 'bg-primary/10 font-medium text-primary'
                          : 'text-foreground/90 hover:bg-muted/60'
                      )}
                    >
                      <span>{chapter.title}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {formatChapterStart(chapter.atSec)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
