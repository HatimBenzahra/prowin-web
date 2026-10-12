import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import CoachingService from '@/services/coaching/coaching.service'
import CoachingManagementList from './CoachingManagementList'
import CoachingDetailModal from './CoachingDetailModal'
import AnalyzedSessionsList from './AnalyzedSessionsList'

/**
 * Modal ouvert depuis « N sessions analysées » d'une synthèse. Deux vues :
 *  - « Analysées » (défaut) : EXACTEMENT les sessions analysées (READY) du sujet
 *    — même source que le compteur et que ce que consomme la synthèse — → détail ;
 *  - « Ajouter des audios » : la liste des enregistrements coachables du sujet
 *    (recherche/filtres/sélection) pour en lancer de nouvelles.
 */
export default function CoachingSessionsModal({
  open,
  onOpenChange,
  subjectType,
  subjectId,
  subjectName,
}) {
  const [tab, setTab] = useState('analysees')
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    if (!open) {
      setTab('analysees')
      setDetail(null)
      return
    }
    if (subjectId == null) return
    let active = true
    setLoading(true)
    const where = subjectType === 'manager' ? { managerId: subjectId } : { userId: subjectId }
    CoachingService.analyses({ ...where, status: 'READY', take: 200 }).then(res => {
      if (!active) return
      setSessions(res.items || [])
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [open, subjectType, subjectId])

  const openDetail = async a => {
    setDetailLoading(true)
    const full = await CoachingService.get(a.id)
    setDetail(full)
    setDetailLoading(false)
  }

  const tabCls = active =>
    cn(
      'rounded-md px-3 py-1 text-sm font-medium transition-colors',
      active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
    )

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[92vh] w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="border-b p-5">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="text-base">
                Sessions{subjectName ? ` — ${subjectName}` : ''}
              </DialogTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => onOpenChange?.(false)}
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-3 inline-flex w-fit rounded-lg border border-border/60 p-0.5">
              <button
                type="button"
                onClick={() => setTab('analysees')}
                className={tabCls(tab === 'analysees')}
              >
                Analysées{sessions.length ? ` (${sessions.length})` : ''}
              </button>
              <button
                type="button"
                onClick={() => setTab('ajouter')}
                className={tabCls(tab === 'ajouter')}
              >
                + Ajouter des audios
              </button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4">
            {tab === 'analysees' ? (
              loading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Chargement…
                </div>
              ) : (
                <AnalyzedSessionsList items={sessions} onSelect={openDetail} sortable />
              )
            ) : (
              subjectId != null && (
                <CoachingManagementList initialSubjectId={subjectId} lockSubject />
              )
            )}
          </div>
        </DialogContent>
      </Dialog>

      <CoachingDetailModal
        open={!!detail || detailLoading}
        onOpenChange={o => {
          if (!o) setDetail(null)
        }}
        analysis={detail}
      />
    </>
  )
}
