import {
  WifiOff,
  ShieldAlert,
  ServerCrash,
  Settings,
  AlertCircle,
  RefreshCw,
  ExternalLink,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { KioskApiError } from '@/services/api/kiosk'

const errorConfigs = {
  network: {
    icon: WifiOff,
    iconBg: 'bg-destructive/10',
    iconColor: 'text-destructive',
    title: 'Serveur OTA inaccessible',
    description:
      'Impossible de contacter le serveur Kiosk. Il est peut-être hors ligne ou votre connexion est instable.',
    hint: 'Vérifiez votre connexion, puis réessayez.',
    borderColor: 'border-destructive/30',
  },
  auth: {
    icon: ShieldAlert,
    iconBg: 'bg-chart-5/10',
    iconColor: 'text-chart-5',
    title: 'Accès refusé',
    description: 'Votre session a expiré ou votre rôle ne donne pas accès aux tablettes.',
    hint: 'Reconnectez-vous. Les pages Kiosk sont réservées aux administrateurs et directeurs.',
    borderColor: 'border-chart-5/30',
  },
  server: {
    icon: ServerCrash,
    iconBg: 'bg-destructive/10',
    iconColor: 'text-destructive',
    title: 'Erreur serveur Kiosk',
    description: 'Le serveur OTA a rencontré une erreur interne.',
    hint: 'Le problème vient du serveur distant. Réessayez dans quelques instants.',
    borderColor: 'border-destructive/30',
  },
  config: {
    icon: Settings,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    title: 'Configuration manquante',
    description: "L'URL du backend n'est pas configurée.",
    hint: 'Contactez un administrateur pour configurer la connexion au serveur Kiosk.',
    borderColor: 'border-primary/30',
  },
  unknown: {
    icon: AlertCircle,
    iconBg: 'bg-muted',
    iconColor: 'text-muted-foreground',
    title: 'Erreur inattendue',
    description: "Une erreur s'est produite lors de la communication avec le serveur Kiosk.",
    hint: null,
    borderColor: 'border-border',
  },
}

function getErrorType(error) {
  if (error instanceof KioskApiError) return error.type
  if (
    error instanceof TypeError &&
    (error.message?.includes('fetch') || error.message?.includes('Failed'))
  )
    return 'network'
  return 'unknown'
}

export default function KioskErrorState({ error, onRetry, className }) {
  const type = getErrorType(error)
  const config = errorConfigs[type] || errorConfigs.unknown
  const Icon = config.icon

  const rawMessage =
    error instanceof KioskApiError
      ? error.statusCode
        ? `HTTP ${error.statusCode} — ${error.message}`
        : error.message
      : error?.message || null

  return (
    <Card className={`${config.borderColor} border-2 border-dashed bg-card/50 ${className || ''}`}>
      <CardContent className="flex flex-col items-center gap-5 py-12 px-6">
        <div className={`rounded-full p-4 ${config.iconBg}`}>
          <Icon className={`h-8 w-8 ${config.iconColor}`} />
        </div>

        <div className="text-center max-w-md space-y-2">
          <h3 className="text-lg font-semibold">{config.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{config.description}</p>

          {rawMessage && type !== 'config' && (
            <div className="mt-3 rounded-md bg-muted/50 border border-border/50 px-3 py-2">
              <p className="text-xs font-mono text-muted-foreground break-all">{rawMessage}</p>
            </div>
          )}

          {config.hint && (
            <p className="text-xs text-muted-foreground/70 mt-2 flex items-center justify-center gap-1.5">
              <ExternalLink className="h-3 w-3 shrink-0" />
              {config.hint}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 mt-2">
          {onRetry && (
            <Button onClick={onRetry} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Réessayer
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
