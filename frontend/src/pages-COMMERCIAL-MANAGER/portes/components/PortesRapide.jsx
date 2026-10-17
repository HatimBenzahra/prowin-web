import React from 'react'
import ProspectionRapideMode from './ProspectionRapideMode'
import { useStatutOptions } from '../hooks/useStatutOptions'

/**
 * Page Vue Rapide des portes
 * Wrapper autour du mode prospection rapide
 */
export default function PortesRapide({
  portes,
  statsData,
  onQuickStatusChange,
  onSwitchToListMode,
  immeuble,
  onOpenEditModal,
  onRepassageChange,
  loadMore,
  hasMore,
  isFetchingMore,
  onAddEtage,
  onAddPorteToEtage,
  onRemoveEtage,
  onRemovePorteFromEtage,
  addingEtage,
  addingPorteToEtage,
}) {
  const statutOptions = useStatutOptions()

  return (
    <ProspectionRapideMode
      portes={portes}
      statsData={statsData}
      onQuickStatusChange={onQuickStatusChange}
      onSwitchToListMode={onSwitchToListMode}
      statutOptions={statutOptions}
      immeuble={immeuble}
      onOpenEditModal={onOpenEditModal}
      onRepassageChange={onRepassageChange}
      loadMore={loadMore}
      hasMore={hasMore}
      isFetchingMore={isFetchingMore}
      onAddEtage={onAddEtage}
      onAddPorteToEtage={onAddPorteToEtage}
      onRemoveEtage={onRemoveEtage}
      onRemovePorteFromEtage={onRemovePorteFromEtage}
      addingEtage={addingEtage}
      addingPorteToEtage={addingPorteToEtage}
    />
  )
}
