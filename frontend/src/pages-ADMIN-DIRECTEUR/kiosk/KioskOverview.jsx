import React, { useMemo } from 'react'
import { RefreshCw } from 'lucide-react'
import { useKioskHealth, useKioskDevices, useKioskLogs } from '@/hooks/metier/api/kiosk'
import { isBatteryKnown, clampBattery } from './batteryUtils'
import OverviewTab from './components/OverviewTab'
import KioskErrorState from './components/KioskErrorState'
import KioskPanelLink from './components/KioskPanelLink'

export default function KioskOverview() {
  const healthQuery = useKioskHealth()
  const devicesQuery = useKioskDevices()
  const logsQuery = useKioskLogs()

  const devices = useMemo(() => devicesQuery.data || [], [devicesQuery.data])
  const onlineDevices = useMemo(() => devices.filter(device => device.online).length, [devices])
  const offlineDevices = useMemo(() => devices.filter(device => !device.online).length, [devices])
  const lowBatteryDevices = useMemo(
    () =>
      devices.filter(
        device => isBatteryKnown(device.batteryLevel) && clampBattery(device.batteryLevel) < 20
      ).length,
    [devices]
  )
  const recentLogs = useMemo(() => (logsQuery.data?.logs || []).slice(0, 10), [logsQuery.data])

  if (healthQuery.isLoading || devicesQuery.isLoading || logsQuery.isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-muted-foreground">Chargement de la vue d&apos;ensemble kiosk...</p>
          </div>
        </div>
      </div>
    )
  }

  const mainError = healthQuery.error || devicesQuery.error || logsQuery.error
  if (mainError) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vue d&apos;ensemble Kiosk</h1>
          <p className="text-muted-foreground mt-1">
            Pilotage global de la flotte et de la santé du serveur OTA
          </p>
        </div>
        <KioskErrorState
          error={mainError}
          onRetry={() => {
            healthQuery.refetch()
            devicesQuery.refetch()
            logsQuery.refetch()
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Vue d&apos;ensemble Kiosk</h1>
        <p className="text-muted-foreground mt-1">
          Pilotage global de la flotte et de la santé du serveur OTA
        </p>
      </div>

      <KioskPanelLink />

      <OverviewTab
        health={healthQuery.data}
        devices={devices}
        recentLogs={recentLogs}
        onlineCount={onlineDevices}
        offlineCount={offlineDevices}
        lowBatteryCount={lowBatteryDevices}
      />
    </div>
  )
}
