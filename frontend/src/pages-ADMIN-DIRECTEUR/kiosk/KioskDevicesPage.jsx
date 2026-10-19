import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import {
  useKioskDevices,
  useKioskSendCommand,
  useKioskDeleteDevice,
} from '@/hooks/metier/api/kiosk'
import DevicesTab from './components/DevicesTab'
import DeviceCommandDialog from './components/DeviceCommandDialog'
import KioskErrorState from './components/KioskErrorState'
import KioskPanelLink from './components/KioskPanelLink'

export default function KioskDevicesPage() {
  const navigate = useNavigate()
  const devicesQuery = useKioskDevices()
  const sendCommandMutation = useKioskSendCommand()
  const deleteDeviceMutation = useKioskDeleteDevice()

  const [deviceFilters, setDeviceFilters] = useState({
    search: '',
    onlineFilter: 'all',
  })
  const [commandDialog, setCommandDialog] = useState({ open: false, data: null })

  const handleDeviceCommand = (device, preset) => {
    if (!device) return

    if (preset?.action) {
      sendCommandMutation.mutate({
        deviceId: device.deviceId,
        action: preset.action,
        payload: preset.payload,
      })
      return
    }

    setCommandDialog({ open: true, data: device })
  }

  const handleSelectDevice = device => {
    if (!device) return
    navigate(`/kiosk/tablettes/${device.deviceId}`)
  }

  const handleDeleteDevice = device => {
    if (window.confirm(`Supprimer la tablette ${device.deviceName || device.deviceId} ?`)) {
      deleteDeviceMutation.mutate(device.deviceId)
    }
  }

  if (devicesQuery.isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-muted-foreground">Chargement des tablettes...</p>
          </div>
        </div>
      </div>
    )
  }

  if (devicesQuery.error) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tablettes</h1>
          <p className="text-muted-foreground mt-1">Gestion du parc de tablettes kiosk</p>
        </div>
        <KioskErrorState error={devicesQuery.error} onRetry={() => devicesQuery.refetch()} />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tablettes</h1>
        <p className="text-muted-foreground mt-1">Gestion du parc de tablettes kiosk</p>
      </div>

      <KioskPanelLink />

      <DevicesTab
        devices={devicesQuery.data || []}
        loading={devicesQuery.isLoading}
        deviceFilters={deviceFilters}
        setDeviceFilters={setDeviceFilters}
        onCommand={handleDeviceCommand}
        onDelete={handleDeleteDevice}
        onSelectDevice={handleSelectDevice}
      />

      <DeviceCommandDialog
        open={commandDialog.open}
        onClose={() => setCommandDialog({ open: false, data: null })}
        onSend={payload => sendCommandMutation.mutate(payload)}
        device={commandDialog.data}
        isPending={sendCommandMutation.isPending}
      />
    </div>
  )
}
