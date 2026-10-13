import React, { useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Package, GitCommit } from 'lucide-react'
import { ChannelBadge, VersionText } from './versionPresentation'

// « 12/10/2026 à 15:42 » : le serveur publie l'APK à la fin de son build.
const formatBuildDate = value => {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return 'date inconnue'
  const day = date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return `${day} à ${time}`
}

const formatRelativeTime = value => {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return 'inconnu'
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `il y a ${days}j`
  if (hours > 0) return `il y a ${hours}h`
  if (minutes > 0) return `il y a ${minutes}min`
  return "à l'instant"
}

// On distingue l'app ProWin (prospection) de l'agent Kiosk via le packageName /
// appName remonté par la release. Pas de hardcode de package.
const APPS = [
  { key: 'prowin', label: 'ProWin' },
  { key: 'kiosk', label: 'Kiosk' },
]
const classifyApp = release => {
  const s = `${release.packageName || ''} ${release.appName || ''}`.toLowerCase()
  return s.includes('kiosk') ? 'kiosk' : 'prowin'
}

/** Dernier build d'une application : c'est lui que les tablettes reçoivent. */
function AppReleaseCard({ label, releases }) {
  const latest = releases.find(r => r.active) ?? releases[0]

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <div className="rounded-md bg-primary/10 p-1.5">
          <Package className="h-4 w-4 text-primary" />
        </div>
        <span className="font-semibold">{label}</span>
        <ChannelBadge channel={latest.channel} />
      </div>

      <div className="mt-3 space-y-1.5">
        <VersionText
          versionName={latest.versionName}
          versionCode={latest.versionCode}
          className="font-mono text-lg font-semibold"
        />
        <p className="text-sm text-muted-foreground">
          Build du {formatBuildDate(latest.uploadedAt)} ({formatRelativeTime(latest.uploadedAt)})
        </p>
        {latest.gitSha && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <GitCommit className="h-3.5 w-3.5 shrink-0" />
            <span className="font-mono">{latest.gitSha.slice(0, 7)}</span>
            {latest.gitMessage && <span className="truncate">{latest.gitMessage}</span>}
          </p>
        )}
      </div>
    </div>
  )
}

export default function ReleasesTab({ releases, loading }) {
  const releasesByApp = useMemo(() => {
    const sorted = [...(releases || [])].sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    )
    return APPS.map(app => ({
      ...app,
      releases: sorted.filter(r => classifyApp(r) === app.key),
    })).filter(app => app.releases.length > 0)
  }, [releases])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dernier build</CardTitle>
        <CardDescription>
          Distribué aux tablettes. Publié par{' '}
          <code className="text-xs">./deploy mobile|kiosk-app</code>. Pour revenir en arrière,
          redéployez l'ancien commit.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <Package className="h-10 w-10 animate-pulse opacity-30" />
            <p className="text-sm">Chargement des versions...</p>
          </div>
        ) : releasesByApp.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
            <Package className="h-10 w-10 opacity-30" />
            <p className="text-sm">Aucune version publiée.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {releasesByApp.map(app => (
              <AppReleaseCard key={app.key} label={app.label} releases={app.releases} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
