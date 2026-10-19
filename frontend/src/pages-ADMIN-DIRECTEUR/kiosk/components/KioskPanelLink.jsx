import React from 'react'
import { ExternalLink } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button-variants'

/**
 * Le choix Prowin V1 / V2 et les actions sur les tablettes se font dans le
 * panneau du kiosque. L'URL suit l'environnement du web (staging ou prod).
 */
function kioskPanelUrl(hostname = window.location.hostname) {
  return hostname.includes('staging')
    ? 'https://kiosk-staging.pro-win.app'
    : 'https://kiosk-ota.winaity.com'
}

export default function KioskPanelLink() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Le choix Prowin V1 / V2, les versions et le journal de chaque tablette se gèrent dans le
        panneau du kiosque.
      </p>
      <a
        href={kioskPanelUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
      >
        Ouvrir le panneau du kiosque
        <ExternalLink className="ml-2 h-4 w-4" />
      </a>
    </div>
  )
}
