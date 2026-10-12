import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Pagination } from '@/components/Pagination'
import { TableSkeleton } from '@/components/LoadingSkeletons'
import { Clock, Mic, Download, X, Loader2, Play, User, ChevronDown, XCircle, Check, Minus } from 'lucide-react'
import { usePagination } from '@/hooks/utils/data/usePagination'
import { useEnregistrementLogic } from './useEnregistrementLogic'
import RecordingDetailModal from './RecordingDetailModal'
import {
  UserAvatar,
  RecordingStatusBadge,
  RecordingCard,
  SortableTableHeader,
  DateRangeFilter,
  SmartSearchBar,
  SpeechScoreBar,
} from './EnregistrementComponents'

const HEADER_SKELETON_KEYS = ['header-1', 'header-2', 'header-3', 'header-4', 'header-5', 'header-6']
const LIST_SKELETON_KEYS = ['list-1', 'list-2', 'list-3', 'list-4']
const RECENT_SKELETON_KEYS = ['recent-1', 'recent-2', 'recent-3', 'recent-4', 'recent-5', 'recent-6']

export default function Enregistrement() {
  const {
    filteredUsers,
    loading,
    error,
    refetch,
    searchTerm,
    setSearchTerm,
    selectedCommercialForRecordings,
    recordings,
    loadingRecordings,
    currentRecordings,
    currentPage,
    totalPages,
    startIndex,
    endIndex,
    goToNextPage,
    goToPreviousPage,
    hasNextPage,
    hasPreviousPage,
    filteredRecordingsCount,
    handleDownloadRecording,
    resetSelection,
    handleUserSelection,
    statusFilter,
    setStatusFilter,
    statusFilterOptions,
    recentRecordings,
    recentRecordingsTotalCount,
    loadingRecentRecordings,
    recentRecordingsError,
    sortConfig,
    handleSort,
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,
    selectedRecordingIds,
    selectedCount,
    toggleRecordingSelection,
    toggleSelectAll,
    clearSelection,
    handleBulkDownload,
    bulkDownloading,
    currentModalRecording,
    openRecordingModal,
    closeRecordingModal,
    goToNextRecording,
    goToPreviousRecording,
    hasNextRecording,
    hasPreviousRecording,
    speechScores,
    analysesByKey,
    coachingStatusOf,
    retryCoaching,
    setAnalysis,
  } = useEnregistrementLogic()

  const [recentModalRecording, setRecentModalRecording] = useState(null)
  const [recentModalIndex, setRecentModalIndex] = useState(null)
  const [smartFilters, setSmartFilters] = useState({
    commercial: null,
    period: 'today',
    searchText: '',
  })

  const groupedUsers = useMemo(() => {
    const managers = filteredUsers.filter(u => u.userType === 'manager')
    const commercials = filteredUsers.filter(u => u.userType !== 'manager')
    return { managers, commercials }
  }, [filteredUsers])

  useEffect(() => {
    if (smartFilters.commercial) {
      const match = filteredUsers.find(u => u.id === smartFilters.commercial.id)
      if (match) handleUserSelection(match)
    }
  }, [smartFilters.commercial, filteredUsers, handleUserSelection])

  const recentPeriodOptions = [
    { value: 'today', label: "Aujourd'hui" },
    { value: 'yesterday', label: 'Hier' },
    { value: 'week', label: 'Cette semaine' },
    { value: 'month', label: 'Ce mois' },
    { value: 'all', label: 'Tous' },
  ]

  const filteredRecentRecordings = useMemo(() => {
    let result = recentRecordings

    if (smartFilters.period) {
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      let startDate
      let endDate = now

      switch (smartFilters.period) {
        case 'today':
          startDate = today
          break
        case 'yesterday': {
          startDate = new Date(today.getTime() - 24 * 60 * 60 * 1000)
          endDate = today
          break
        }
        case 'week': {
          const day = today.getDay()
          const mondayOffset = day === 0 ? 6 : day - 1
          startDate = new Date(today)
          startDate.setDate(today.getDate() - mondayOffset)
          break
        }
        case 'month':
          startDate = new Date(today.getFullYear(), today.getMonth(), 1)
          break
        default:
          break
      }

      if (startDate) {
        result = result.filter(r => {
          const d = new Date(r.lastModified)
          return d >= startDate && d < endDate
        })
      }
    }

    if (smartFilters.commercial) {
      const { prenom, nom, id } = smartFilters.commercial
      result = result.filter(r => {
        if (r.userId && r.userId === id) return true
        const fullName = `${r.userPrenom || ''} ${r.userNom || ''}`.trim().toLowerCase()
        const filterName = `${prenom || ''} ${nom || ''}`.trim().toLowerCase()
        return fullName === filterName
      })
    }

    if (smartFilters.searchText) {
      const q = smartFilters.searchText.toLowerCase()
      result = result.filter(r => r.filename?.toLowerCase().includes(q))
    }

    return result
  }, [recentRecordings, smartFilters])

  const {
    currentItems: currentRecentRecordings,
    currentPage: recentCurrentPage,
    totalPages: recentTotalPages,
    startIndex: recentStartIndex,
    endIndex: recentEndIndex,
    goToNextPage: goToNextRecentPage,
    goToPreviousPage: goToPreviousRecentPage,
    hasNextPage: hasNextRecentPage,
    hasPreviousPage: hasPreviousRecentPage,
  } = usePagination(filteredRecentRecordings, 20)

  const openRecentModal = useCallback((rec) => {
    const idx = filteredRecentRecordings.findIndex(r => r.id === rec.id)
    setRecentModalRecording(rec)
    setRecentModalIndex(idx)
  }, [filteredRecentRecordings])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-500/10">
            <Mic className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Enregistrements</h1>
            <p className="text-sm text-muted-foreground">Consultation des appels enregistrés</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {HEADER_SKELETON_KEYS.map(key => (
            <div key={key} className="h-16 rounded-xl border border-border/40 bg-muted/20 animate-pulse" />
          ))}
        </div>
        <div className="space-y-3">
          {LIST_SKELETON_KEYS.map(key => (
            <div key={key} className="h-16 rounded-xl border border-border/40 bg-muted/20 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-500/10">
            <Mic className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Enregistrements</h1>
            <p className="text-sm text-muted-foreground">Consultation des appels enregistrés</p>
          </div>
        </div>
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-6">
            <p className="text-destructive font-medium">Erreur lors du chargement : {error}</p>
            <Button onClick={refetch} className="mt-3" variant="outline" size="sm">
              Reessayer
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-500/10">
          <Mic className="w-5 h-5 text-red-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Enregistrements</h1>
          <p className="text-sm text-muted-foreground">Analyse et révision des appels commerciaux</p>
        </div>
      </div>

      <SmartSearchBar
        allUsers={filteredUsers}
        activeFilters={smartFilters}
        onFilterChange={setSmartFilters}
        totalResults={filteredRecentRecordings.length}
      />

      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Enregistrements récents
              </CardTitle>
              <CardDescription className="mt-1">Derniers enregistrements de tous vos commerciaux</CardDescription>
              <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                {recentPeriodOptions.map(opt => {
                  const isActive = opt.value === 'all'
                    ? smartFilters.period === null
                    : smartFilters.period === opt.value
                  return (
                    <button
                      type="button"
                      key={opt.value}
                      onClick={() =>
                        setSmartFilters(prev => ({
                          ...prev,
                          period: opt.value === 'all' ? null : opt.value,
                        }))
                      }
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline" className="h-6 px-2">
                {filteredRecentRecordings.length}
                {recentRecordingsTotalCount > filteredRecentRecordings.length
                  ? ` / ${recentRecordingsTotalCount}`
                  : ''}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {loadingRecentRecordings ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {RECENT_SKELETON_KEYS.map(key => (
                <Skeleton key={key} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : filteredRecentRecordings.length > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {currentRecentRecordings.map(recording => (
                  <RecordingCard
                    key={recording.id}
                    recording={recording}
                    onPlay={openRecentModal}
                    onDownload={handleDownloadRecording}
                    speechScore={speechScores.get(recording.key)}
                  />
                ))}
              </div>
              <Pagination
                currentPage={recentCurrentPage}
                totalPages={recentTotalPages}
                startIndex={recentStartIndex}
                endIndex={recentEndIndex}
                totalItems={filteredRecentRecordings.length}
                itemLabel="enregistrements"
                onPrevious={goToPreviousRecentPage}
                onNext={goToNextRecentPage}
                hasPreviousPage={hasPreviousRecentPage}
                hasNextPage={hasNextRecentPage}
              />
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              <Clock className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="font-medium">
                {smartFilters.period || smartFilters.commercial || smartFilters.searchText
                  ? 'Aucun enregistrement ne correspond aux filtres actifs'
                  : 'Aucun enregistrement récent'}
              </p>
            </div>
          )}

          {recentRecordingsError && (
            <p className="text-xs text-muted-foreground mt-3">
              ⚠ Certains utilisateurs n'ont pas pu être chargés
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle>Par utilisateur</CardTitle>
          <CardDescription>
            Sélectionnez un commercial ou manager pour voir ses enregistrements
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4 mb-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Statut
              </span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[110px] h-9">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  {statusFilterOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Utilisateur
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-9 min-w-[260px] justify-between gap-2 font-normal">
                    <span className="flex items-center gap-2 truncate">
                      {selectedCommercialForRecordings ? (
                        <>
                          <UserAvatar
                            prenom={selectedCommercialForRecordings.prenom}
                            nom={selectedCommercialForRecordings.nom}
                            userType={selectedCommercialForRecordings.userType}
                            size="sm"
                          />
                          <span className="truncate font-medium">
                            {selectedCommercialForRecordings.prenom} {selectedCommercialForRecordings.nom}
                          </span>
                        </>
                      ) : (
                        <>
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Sélectionner...</span>
                        </>
                      )}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 opacity-50 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[260px] max-h-72 overflow-y-auto">
                  {selectedCommercialForRecordings && (
                    <>
                      <DropdownMenuItem onClick={resetSelection} className="gap-2 text-muted-foreground">
                        <XCircle className="w-4 h-4" />
                        Réinitialiser la sélection
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  {filteredUsers.length === 0 ? (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                      Aucun utilisateur trouvé
                    </div>
                  ) : (
                    <>
                      {groupedUsers.managers.length > 0 && (
                        <DropdownMenuGroup>
                          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                            Managers ({groupedUsers.managers.length})
                          </DropdownMenuLabel>
                          {groupedUsers.managers.map(user => (
                            <DropdownMenuItem
                              key={`manager-${user.id}`}
                              onClick={() => handleUserSelection(user)}
                              className="gap-2.5 py-2"
                            >
                              <UserAvatar prenom={user.prenom} nom={user.nom} userType={user.userType} size="sm" />
                              <span className="truncate">{user.prenom} {user.nom}</span>
                              {selectedCommercialForRecordings?.id === user.id &&
                                selectedCommercialForRecordings?.userType === user.userType && (
                                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                              )}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuGroup>
                      )}
                      {groupedUsers.managers.length > 0 && groupedUsers.commercials.length > 0 && (
                        <DropdownMenuSeparator />
                      )}
                      {groupedUsers.commercials.length > 0 && (
                        <DropdownMenuGroup>
                          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                            Commerciaux ({groupedUsers.commercials.length})
                          </DropdownMenuLabel>
                          {groupedUsers.commercials.map(user => (
                            <DropdownMenuItem
                              key={`commercial-${user.id}`}
                              onClick={() => handleUserSelection(user)}
                              className="gap-2.5 py-2"
                            >
                              <UserAvatar prenom={user.prenom} nom={user.nom} userType={user.userType} size="sm" />
                              <span className="truncate">{user.prenom} {user.nom}</span>
                              {selectedCommercialForRecordings?.id === user.id &&
                                selectedCommercialForRecordings?.userType === user.userType && (
                                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                              )}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuGroup>
                      )}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Recherche
              </span>
              <Input
                placeholder="Rechercher dans les enregistrements..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="h-9"
                disabled={!selectedCommercialForRecordings}
              />
            </div>

            <DateRangeFilter
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
              onClear={() => {
                setDateFrom(null)
                setDateTo(null)
              }}
            />

            <Badge variant="outline" className="h-9 px-3 shrink-0">
              {filteredRecordingsCount} enregistrement(s)
            </Badge>
          </div>

          {selectedCount > 0 && (
            <div className="flex flex-col gap-2 px-3 py-2 bg-muted/60 border border-border/60 rounded-lg mb-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm font-medium">{selectedCount} sélectionné(s)</span>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearSelection}
                  className="h-7 text-xs gap-1"
                >
                  <X className="w-3 h-3" /> Désélectionner
                </Button>
                <Button
                  size="sm"
                  onClick={handleBulkDownload}
                  disabled={bulkDownloading}
                  className="h-7 text-xs gap-1"
                >
                  {bulkDownloading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Download className="w-3 h-3" />
                  )}
                  Télécharger
                </Button>
              </div>
            </div>
          )}

          {loadingRecordings ? (
            <TableSkeleton rows={6} />
          ) : !selectedCommercialForRecordings ? (
            <div className="text-center py-8 text-muted-foreground">
              <User className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Sélectionnez un utilisateur pour voir ses enregistrements</p>
            </div>
          ) : recordings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Aucun enregistrement trouvé pour cet utilisateur</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border overflow-x-auto">
                <Table className="min-w-[640px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        {(() => {
                          if (!currentRecordings.length) return null

                          const allSelected =
                            currentRecordings.every(r => selectedRecordingIds.has(r.id))
                          const someSelected = selectedCount > 0 && !allSelected
                          return (
                            <button
                              type="button"
                              onClick={toggleSelectAll}
                              className={`w-4.5 h-4.5 rounded-md border flex items-center justify-center transition-all duration-150 ${
                                allSelected || someSelected
                                  ? 'bg-primary border-primary text-primary-foreground'
                                  : 'border-border/80 bg-background hover:border-primary/50'
                              }`}
                              aria-label="Tout sélectionner"
                            >
                              {allSelected && <Check className="w-3 h-3" strokeWidth={3} />}
                              {someSelected && <Minus className="w-3 h-3" strokeWidth={3} />}
                            </button>
                          )
                        })()}
                      </TableHead>
                      <TableHead>
                        <SortableTableHeader
                          label="Fichier"
                          sortKey="filename"
                          currentSort={sortConfig}
                          onSort={handleSort}
                        />
                      </TableHead>
                      <TableHead>
                        <SortableTableHeader
                          label="Date & Heure"
                          sortKey="date"
                          currentSort={sortConfig}
                          onSort={handleSort}
                        />
                      </TableHead>
                      <TableHead>
                        <SortableTableHeader
                          label="Taille"
                          sortKey="size"
                          currentSort={sortConfig}
                          onSort={handleSort}
                        />
                      </TableHead>
                      <TableHead>
                        <SortableTableHeader
                          label="Parole"
                          sortKey="speechScore"
                          currentSort={sortConfig}
                          onSort={handleSort}
                        />
                      </TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentRecordings.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Aucun enregistrement trouvé
                        </TableCell>
                      </TableRow>
                    ) : (
                      currentRecordings.map(recording => (
                        <TableRow
                          key={recording.id}
                          onClick={() => openRecordingModal(recording)}
                          className="cursor-pointer"
                        >
                          <TableCell onClick={e => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                toggleRecordingSelection(recording.id);
                              }}
                              className={`w-4.5 h-4.5 rounded-md border flex items-center justify-center transition-all duration-150 cursor-pointer ${
                                selectedRecordingIds.has(recording.id)
                                  ? 'bg-primary border-primary text-primary-foreground scale-105'
                                  : 'border-border/80 bg-background hover:border-primary/50'
                              }`}
                            >
                              {selectedRecordingIds.has(recording.id) && (
                                <Check className="w-3 h-3" strokeWidth={3} />
                              )}
                            </button>
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <div
                                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    Date.now() - new Date(recording.lastModified).getTime() <
                                    24 * 60 * 60 * 1000
                                      ? 'bg-green-500'
                                      : 'bg-muted-foreground/20'
                                  }`}
                                />
                                <span className="truncate">{recording.filename}</span>
                              </div>
                              <div>
                                <RecordingStatusBadge lastModified={recording.lastModified} />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span>{recording.date}</span>
                              <span className="text-sm text-muted-foreground">{recording.time}</span>
                            </div>
                          </TableCell>
                          <TableCell>{recording.duration}</TableCell>
                          <TableCell>
                            {(() => {
                              const sc = speechScores.get(recording.key)
                              if (sc?.status === 'ready' && typeof sc.score === 'number') {
                                return <SpeechScoreBar score={sc.score} />
                              }
                              return <div className="w-10 h-1.5 animate-pulse bg-muted rounded-full" />
                            })()}
                          </TableCell>
                          <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-2 justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openRecordingModal(recording)}
                              >
                                <Play className="w-4 h-4 mr-1" />
                                Détail
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDownloadRecording(recording)}
                                disabled={!recording.url && !recording.rawUrl}
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                startIndex={startIndex}
                endIndex={endIndex}
                totalItems={filteredRecordingsCount}
                itemLabel="enregistrements"
                onPrevious={goToPreviousPage}
                onNext={goToNextPage}
                hasPreviousPage={hasPreviousPage}
                hasNextPage={hasNextPage}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <RecordingDetailModal
        open={!!currentModalRecording}
        onOpenChange={o => {
          if (!o) closeRecordingModal()
        }}
        recording={currentModalRecording}
        analysis={analysesByKey.get(currentModalRecording?.key)}
        coachingStatus={coachingStatusOf(currentModalRecording?.key)}
        onRetryCoaching={retryCoaching}
        onAnalysisLaunched={setAnalysis}
        currentIndex={currentModalRecording ? currentRecordings.indexOf(currentModalRecording) : 0}
        totalCount={currentRecordings.length}
        hasNext={hasNextRecording}
        hasPrevious={hasPreviousRecording}
        onNext={goToNextRecording}
        onPrevious={goToPreviousRecording}
        onDownload={handleDownloadRecording}
      />

      <RecordingDetailModal
        open={!!recentModalRecording}
        onOpenChange={o => {
          if (!o) {
            setRecentModalRecording(null)
            setRecentModalIndex(null)
          }
        }}
        recording={recentModalRecording}
        analysis={analysesByKey.get(recentModalRecording?.key)}
        coachingStatus={coachingStatusOf(recentModalRecording?.key)}
        onRetryCoaching={retryCoaching}
        onAnalysisLaunched={setAnalysis}
        currentIndex={recentModalIndex ?? 0}
        totalCount={filteredRecentRecordings.length}
        hasNext={recentModalIndex !== null && recentModalIndex < filteredRecentRecordings.length - 1}
        hasPrevious={recentModalIndex !== null && recentModalIndex > 0}
        onNext={() => {
          const next = (recentModalIndex ?? 0) + 1
          setRecentModalIndex(next)
          setRecentModalRecording(filteredRecentRecordings[next])
        }}
        onPrevious={() => {
          const prev = (recentModalIndex ?? 0) - 1
          setRecentModalIndex(prev)
          setRecentModalRecording(filteredRecentRecordings[prev])
        }}
        onDownload={handleDownloadRecording}
      />
    </div>
  )
}
