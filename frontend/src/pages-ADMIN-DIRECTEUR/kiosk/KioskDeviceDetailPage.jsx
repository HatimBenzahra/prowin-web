import React, { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  useKioskDevices,
  useKioskDevice,
  useKioskDeviceLogs,
  useKioskDeployHistory,
  useKioskSendCommand,
  useKioskRenameDevice,
  useKioskDeleteDevice,
} from '@/hooks/metier/api/kiosk'
import { useBackNavigation } from '@/hooks/ui/use-back-navigation'
import { formatBattery, clampBattery, isBatteryKnown, getBatteryHexColor } from './batteryUtils'
import DeviceCommandDialog from './components/DeviceCommandDialog'
import KioskErrorState from './components/KioskErrorState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft,
  RefreshCw,
  Battery,
  Signal,
  Globe,
  Wifi,
  Smartphone,
  MapPin,
  Copy,
  Check,
  Zap,
  Clock,
  Terminal,
  Cpu,
  Radio,
  Settings2,
  User,
  Trash2,
  Pencil,
  ScrollText,
  Rocket,
  Activity,
} from 'lucide-react'

const formatDateTime = value => {
  if (!value) return 'Inconnu'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Inconnu'
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatRelativeTime = value => {
  if (!value) return 'Inconnu'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Inconnu'
  const diffMs = Date.now() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  if (diffSec < 60) return "À l'instant"
  if (diffMin < 60) return `il y a ${diffMin} min`
  if (diffHour < 24) return `il y a ${diffHour} h`
  if (diffDay < 7) return `il y a ${diffDay} j`
  return date.toLocaleDateString('fr-FR')
}

const SectionCard = ({ icon: Icon, title, borderColor = 'border-l-primary', action, children }) => (
  <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-[0_1px_3px_0_rgb(0_0_0/_0.04)]">
    <div
      className={`flex items-center gap-2.5 px-4 py-3 border-b border-border/40 border-l-2 ${borderColor}`}
    >
      {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      {action && <div className="ml-auto">{action}</div>}
    </div>
    <div className="p-4">{children}</div>
  </div>
)

const InfoRow = ({ label, value, mono = false }) => (
  <div className="flex items-start justify-between gap-4 py-1.5">
    <span className="text-xs text-muted-foreground shrink-0">{label}</span>
    <span className={`text-xs font-medium text-right break-all ${mono ? 'font-mono' : ''}`}>
      {value || <span className="text-muted-foreground/40">—</span>}
    </span>
  </div>
)

const VersionPill = ({ label, value, code }) => (
  <div className="flex items-center justify-between py-1.5">
    <span className="text-xs text-muted-foreground">{label}</span>
    <div className="flex items-center gap-1.5">
      {value ? (
        <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
          {value}
        </span>
      ) : (
        <span className="text-muted-foreground/40 text-xs">—</span>
      )}
      {code && <span className="text-xs text-muted-foreground/60 font-mono">#{code}</span>}
    </div>
  </div>
)

const SignalBars = ({ strength }) => {
  const level = Math.round((Number(strength) || 0) / 25)
  const clamped = Math.max(0, Math.min(4, level))
  return (
    <div className="flex items-end gap-0.5 h-4">
      {[1, 2, 3, 4].map(bar => (
        <div
          key={bar}
          className={`w-1.5 rounded-sm transition-colors ${bar <= clamped ? 'bg-chart-2' : 'bg-muted'}`}
          style={{ height: `${bar * 25}%` }}
        />
      ))}
    </div>
  )
}

const CopyButton = ({ value }) => {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(String(value))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
    >
      {copied ? <Check className="h-3 w-3 text-chart-2" /> : <Copy className="h-3 w-3" />}
    </button>
  )
}

const LOG_TYPE_STYLES = {
  battery_low: 'text-chart-5',
  battery_critical: 'text-destructive',
  gps_lost: 'text-destructive',
  kiosk_unlocked: 'text-destructive',
  device_online: 'text-chart-2',
  gps_acquired: 'text-chart-2',
  app_updated: 'text-primary',
}

const DEPLOY_STATUS_STYLES = {
  success: 'bg-chart-2/15 text-chart-2 border-chart-2/30',
  failed: 'bg-destructive/15 text-destructive border-destructive/30',
  pending: 'bg-chart-5/15 text-chart-5 border-chart-5/30',
}

export default function KioskDeviceDetailPage() {
  const { deviceId } = useParams()
  const navigate = useNavigate()
  // `navigate` reste utilisé pour la redirection après suppression : on ne peut pas
  // « revenir » sur la fiche d'une tablette qui n'existe plus.
  const goBack = useBackNavigation('/kiosk/tablettes')

  // Source principale : la liste des tablettes (déjà exposée et mise en cache).
  // On évite ainsi de dépendre d'un endpoint /devices/:id qui pourrait ne pas
  // être déployé. Repli sur l'endpoint unitaire uniquement si la tablette n'est
  // pas trouvée dans la liste (cas rare).
  const devicesQuery = useKioskDevices()
  const deviceFromList = useMemo(
    () => (devicesQuery.data || []).find(item => item.deviceId === deviceId),
    [devicesQuery.data, deviceId]
  )
  const listReady = !devicesQuery.isLoading
  const singleQuery = useKioskDevice(listReady && !deviceFromList ? deviceId : undefined)

  const logsQuery = useKioskDeviceLogs(deviceId, { limit: 30 })
  const historyQuery = useKioskDeployHistory({ deviceId, limit: 20 })

  const sendCommandMutation = useKioskSendCommand()
  const renameDeviceMutation = useKioskRenameDevice()
  const deleteDeviceMutation = useKioskDeleteDevice()

  const [commandDialogOpen, setCommandDialogOpen] = useState(false)

  const device = deviceFromList || singleQuery.data
  const isLoading = devicesQuery.isLoading || (!deviceFromList && singleQuery.isFetching)
  const loadError = !device && listReady && (devicesQuery.error || singleQuery.error)
  const batteryLevel = device?.batteryLevel
  const batteryWidth = clampBattery(batteryLevel)
  const pendingCount = device?.pendingCommands?.length || 0

  const handleRename = () => {
    if (!device) return
    const newName = window.prompt('Nouveau nom de la tablette', device.deviceName || '')
    if (!newName || !newName.trim()) return
    renameDeviceMutation.mutate({ deviceId: device.deviceId, deviceName: newName.trim() })
  }

  const handleDelete = () => {
    if (!device) return
    if (window.confirm(`Supprimer la tablette ${device.deviceName || device.deviceId} ?`)) {
      deleteDeviceMutation.mutate(device.deviceId, {
        onSuccess: () => navigate('/kiosk/tablettes'),
      })
    }
  }

  const backButton = (
    <Button
      variant="ghost"
      size="sm"
      className="self-start w-fit text-muted-foreground hover:text-foreground -ml-2"
      onClick={goBack}
    >
      <ArrowLeft className="h-4 w-4" />
      Retour
    </Button>
  )

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-6">
        {backButton}
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Chargement de la tablette...</p>
          </div>
        </div>
      </div>
    )
  }

  if (loadError || !device) {
    return (
      <div className="flex flex-1 flex-col gap-6">
        {backButton}
        <KioskErrorState
          error={loadError || new Error('Tablette introuvable')}
          onRetry={() => devicesQuery.refetch()}
        />
      </div>
    )
  }

  const logs = logsQuery.data?.logs || []
  const history = historyQuery.data?.entries || []

  return (
    <div className="flex flex-1 flex-col gap-6">
      {backButton}

      {/* Hero */}
      <div className="rounded-xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_0_rgb(0_0_0/_0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight truncate">
                {device.deviceName || 'Tablette'}
              </h1>
              <Badge
                className={
                  device.online
                    ? 'bg-chart-2/15 text-chart-2 border-chart-2/30 text-xs'
                    : 'bg-muted text-muted-foreground text-xs'
                }
                variant="outline"
              >
                <span
                  className={`mr-1.5 inline-flex h-1.5 w-1.5 rounded-full ${
                    device.online ? 'bg-chart-2 animate-pulse' : 'bg-muted-foreground/50'
                  }`}
                />
                {device.online ? 'En ligne' : 'Hors ligne'}
              </Badge>
              {pendingCount > 0 && (
                <Badge variant="secondary" className="text-xs tabular-nums">
                  <Terminal className="h-3 w-3 mr-1" />
                  {pendingCount} commande{pendingCount > 1 ? 's' : ''} en attente
                </Badge>
              )}
            </div>
            {device.model && <p className="text-sm text-muted-foreground mt-1">{device.model}</p>}
            <p className="text-sm mt-2 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              {device.commercialName ? (
                <span className="font-medium text-foreground">{device.commercialName}</span>
              ) : (
                <span className="text-muted-foreground/60">Aucun commercial assigné</span>
              )}
            </p>
          </div>

          {/* Battery */}
          <div className="w-full sm:w-56 space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {device.batteryCharging && (
                  <Zap className="h-3.5 w-3.5 text-chart-5 animate-pulse" />
                )}
                <Battery className="h-3.5 w-3.5 text-muted-foreground" />
                <span
                  className="text-sm font-bold tabular-nums"
                  style={{
                    color: isBatteryKnown(batteryLevel)
                      ? getBatteryHexColor(batteryLevel)
                      : undefined,
                  }}
                >
                  {formatBattery(batteryLevel)}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {device.batteryCharging ? 'En charge' : 'Batterie'}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${batteryWidth}%`,
                  backgroundColor: isBatteryKnown(batteryLevel)
                    ? getBatteryHexColor(batteryLevel)
                    : 'transparent',
                }}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t border-border/50">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              sendCommandMutation.mutate({ deviceId: device.deviceId, action: 'ota_check' })
            }
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Vérifier MAJ
          </Button>
          <Button size="sm" variant="outline" onClick={handleRename}>
            <Pencil className="h-3.5 w-3.5" />
            Renommer
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCommandDialogOpen(true)}>
            <Settings2 className="h-3.5 w-3.5" />
            Actions avancées
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto"
            onClick={handleDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Supprimer
          </Button>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <SectionCard icon={Smartphone} title="Identité" borderColor="border-l-primary">
            <InfoRow label="Nom" value={device.deviceName} />
            <InfoRow label="Modèle" value={device.model} />
            <InfoRow label="Constructeur" value={device.manufacturer} />
            <InfoRow label="Numéro de série" value={device.serialNumber} mono />
            <InfoRow label="Device ID" value={device.deviceId} mono />
          </SectionCard>

          <SectionCard icon={Cpu} title="Logiciel" borderColor="border-l-chart-2">
            <VersionPill label="Android" value={device.androidVersion} />
            <VersionPill label="Kiosk" value={device.kioskVersion} code={device.kioskVersionCode} />
            <VersionPill
              label="ProWin"
              value={device.prowinVersion}
              code={device.prowinVersionCode}
            />
          </SectionCard>

          <SectionCard icon={Radio} title="Réseau" borderColor="border-l-blue-500">
            <div className="space-y-1">
              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs text-muted-foreground">Signal</span>
                <div className="flex items-center gap-2">
                  <SignalBars strength={device.signalStrength} />
                  {device.signalStrength != null && (
                    <span className="text-xs font-medium tabular-nums">
                      {device.signalStrength}%
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs text-muted-foreground">Type</span>
                <div className="flex items-center gap-1.5">
                  {(device.networkType || '').toLowerCase().includes('wifi') ? (
                    <Wifi className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <Signal className="h-3.5 w-3.5 text-chart-5" />
                  )}
                  <span className="text-xs font-medium">{device.networkType || '—'}</span>
                </div>
              </div>
              <InfoRow label="Nom réseau" value={device.networkName} />
              <InfoRow label="Sous-type" value={device.networkSubtype} />
              <InfoRow label="Opérateur" value={device.operatorName} />
              <InfoRow label="Adresse IP" value={device.ipAddress} mono />
            </div>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard icon={Globe} title="GPS" borderColor="border-l-destructive">
            {device.latitude == null || device.longitude == null ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="rounded-full bg-muted/50 p-3">
                  <MapPin className="h-6 w-6 text-muted-foreground/30" />
                </div>
                <p className="text-xs text-muted-foreground">Pas de données GPS disponibles</p>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-muted-foreground">Latitude</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono font-medium">
                      {Number(device.latitude).toFixed(6)}
                    </span>
                    <CopyButton value={device.latitude} />
                  </div>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-muted-foreground">Longitude</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono font-medium">
                      {Number(device.longitude).toFixed(6)}
                    </span>
                    <CopyButton value={device.longitude} />
                  </div>
                </div>
                {device.locationAccuracy != null && (
                  <InfoRow label="Précision" value={`±${Math.round(device.locationAccuracy)} m`} />
                )}
                <div className="mt-2 pt-2 border-t border-border/30">
                  <button
                    type="button"
                    onClick={() =>
                      window.open(
                        `https://www.google.com/maps?q=${device.latitude},${device.longitude}`,
                        '_blank'
                      )
                    }
                    className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <MapPin className="h-3 w-3" />
                    Voir sur la carte
                  </button>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard icon={Clock} title="Chronologie" borderColor="border-l-chart-5">
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 h-5 w-5 rounded-full bg-muted/60 flex items-center justify-center shrink-0">
                  <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Premier contact</p>
                  <p className="text-xs font-medium mt-0.5">{formatDateTime(device.firstSeen)}</p>
                </div>
              </div>
              <div className="ml-2.5 h-4 w-px bg-border/50" />
              <div className="flex items-start gap-3">
                <div className="mt-0.5 h-5 w-5 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Dernier contact</p>
                  <p className="text-xs font-medium mt-0.5">
                    {formatDateTime(device.lastSeen)}
                    <span className="ml-2 text-muted-foreground/60">
                      ({formatRelativeTime(device.lastSeen)})
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Journaux : côte à côte sur grand écran, chacun avec son scroll interne */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        {/* Activity logs */}
        <SectionCard
          icon={Activity}
          title="Activité récente"
          borderColor="border-l-chart-2"
          action={
            logsQuery.isFetching ? (
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
            ) : (
              <span className="text-xs text-muted-foreground tabular-nums">{logs.length}</span>
            )
          }
        >
          {logsQuery.isLoading ? (
            <div className="py-8 flex justify-center text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin opacity-40" />
            </div>
          ) : logs.length === 0 ? (
            <div className="py-8 flex flex-col items-center gap-2 text-center">
              <ScrollText className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">Aucun événement enregistré</p>
            </div>
          ) : (
            <div className="space-y-0.5 max-h-[22rem] overflow-y-auto pr-1">
              {logs.map(log => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 py-2 border-b border-border/30 last:border-0"
                >
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${(
                      LOG_TYPE_STYLES[log.type] || 'text-muted-foreground'
                    ).replace('text-', 'bg-')}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium leading-snug">{log.message}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={`text-[10px] font-mono uppercase tracking-wide ${
                          LOG_TYPE_STYLES[log.type] || 'text-muted-foreground/60'
                        }`}
                      >
                        {log.type}
                      </span>
                      <span className="text-[10px] text-muted-foreground/50">
                        {formatRelativeTime(log.timestamp)}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground/40 shrink-0 tabular-nums">
                    {formatDateTime(log.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Deploy history */}
        <SectionCard
          icon={Rocket}
          title="Historique des déploiements"
          borderColor="border-l-primary"
          action={
            historyQuery.isFetching ? (
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
            ) : (
              <span className="text-xs text-muted-foreground tabular-nums">{history.length}</span>
            )
          }
        >
          {historyQuery.isLoading ? (
            <div className="py-8 flex justify-center text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin opacity-40" />
            </div>
          ) : history.length === 0 ? (
            <div className="py-8 flex flex-col items-center gap-2 text-center">
              <Rocket className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">Aucun déploiement pour cette tablette</p>
            </div>
          ) : (
            <div className="space-y-0.5 max-h-[22rem] overflow-y-auto pr-1">
              {history.map(entry => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium leading-snug flex items-center gap-1.5">
                      {entry.packageName}
                      {entry.versionName && (
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          v{entry.versionName}
                          {entry.versionCode != null && (
                            <span className="ml-1 text-primary/60 font-mono">
                              #{entry.versionCode}
                            </span>
                          )}
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground/60 capitalize">
                        {entry.action}
                      </span>
                      <span className="text-[10px] text-muted-foreground/40">·</span>
                      <span className="text-[10px] text-muted-foreground/60">
                        {entry.initiatedBy}
                      </span>
                      <span className="text-[10px] text-muted-foreground/40">·</span>
                      <span className="text-[10px] text-muted-foreground/50">
                        {formatRelativeTime(entry.timestamp)}
                      </span>
                    </div>
                  </div>
                  {entry.status && (
                    <Badge
                      variant="outline"
                      className={`text-[10px] shrink-0 ${
                        DEPLOY_STATUS_STYLES[entry.status] || 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {entry.status}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <DeviceCommandDialog
        open={commandDialogOpen}
        onClose={() => setCommandDialogOpen(false)}
        device={device}
        isPending={sendCommandMutation.isPending}
        onSend={async cmd => {
          await sendCommandMutation.mutateAsync(cmd)
          setCommandDialogOpen(false)
        }}
      />
    </div>
  )
}
