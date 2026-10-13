import { authService } from '@/services/auth'

export type KioskErrorType = 'network' | 'auth' | 'server' | 'config' | 'unknown'

export class KioskApiError extends Error {
  public type: KioskErrorType

  constructor(
    message: string,
    public statusCode: number,
    type?: KioskErrorType,
    public responseBody?: unknown
  ) {
    super(message)
    this.name = 'KioskApiError'
    this.type = type || KioskApiError.inferType(statusCode)
  }

  private static inferType(statusCode: number): KioskErrorType {
    if (statusCode === 0) return 'network'
    if (statusCode === 401 || statusCode === 403) return 'auth'
    if (statusCode >= 500) return 'server'
    return 'unknown'
  }

  get isNetworkError() {
    return this.type === 'network'
  }
  get isAuthError() {
    return this.type === 'auth'
  }
  get isServerError() {
    return this.type === 'server'
  }
  get isConfigError() {
    return this.type === 'config'
  }
}

export function classifyKioskError(error: unknown): KioskApiError {
  if (error instanceof KioskApiError) return error

  const msg = error instanceof Error ? error.message.toLowerCase() : ''
  const isNetworkError =
    error instanceof TypeError &&
    (msg.includes('fetch') ||
      msg.includes('network') ||
      msg.includes('failed') ||
      msg.includes('load') ||
      msg.includes('cors') ||
      msg.includes('timeout'))

  if (isNetworkError) {
    return new KioskApiError(
      'Le serveur OTA Kiosk est inaccessible. Vérifiez que le serveur est en ligne.',
      0,
      'network'
    )
  }

  if (
    error instanceof DOMException &&
    (error.name === 'AbortError' || error.name === 'NetworkError')
  ) {
    return new KioskApiError('La requête a expiré ou le réseau est indisponible.', 0, 'network')
  }

  if (error instanceof Error) {
    return new KioskApiError(error.message, 0, 'unknown')
  }

  return new KioskApiError('Erreur inconnue.', 0, 'unknown')
}

/**
 * Client des pages Kiosk. Le navigateur ne parle JAMAIS directement au serveur
 * kiosk : il passe par le backend ProWin (`/kiosk-api`), authentifié avec le jeton
 * de l'utilisateur (admin / directeur). Les identifiants admin du kiosk restent
 * côté serveur — avant, ils étaient compilés dans le JS public.
 */
class KioskApiClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = (baseUrl || '').replace(/\/+$/, '')
  }

  get isConfigured(): boolean {
    return Boolean(this.baseUrl)
  }

  private buildUrl(endpoint: string, params?: Record<string, string | number | undefined>): string {
    const url = new URL(`${this.baseUrl}${endpoint}`)
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value))
        }
      }
    }
    return url.toString()
  }

  private getHeaders(isJson: boolean): Record<string, string> {
    return {
      ...authService.getAuthorizationHeaders(),
      ...(isJson ? { 'Content-Type': 'application/json' } : {}),
    }
  }

  /**
   * Envoie la requête avec le jeton courant ; sur 401 (jeton expiré), rafraîchit
   * la session puis rejoue une seule fois — même logique que le client GraphQL.
   */
  private async send(url: string, init: RequestInit, isJson: boolean): Promise<Response> {
    const response = await fetch(url, { ...init, headers: this.getHeaders(isJson) })
    if (response.status !== 401) return response
    const recovered = await authService.handleAuthenticationChallenge()
    if (!recovered) return response
    return fetch(url, { ...init, headers: this.getHeaders(isJson) })
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let body: unknown
      try {
        body = await response.json()
      } catch {
        body = await response.text().catch(() => null)
      }
      const message =
        typeof body === 'object' && body && 'error' in body
          ? String((body as Record<string, unknown>).error)
          : `HTTP ${response.status}: ${response.statusText}`
      throw new KioskApiError(message, response.status, undefined, body)
    }
    return response.json() as Promise<T>
  }

  private assertConfigured(): void {
    if (!this.baseUrl) {
      throw new KioskApiError(
        'URL du backend non configurée. Ajoutez VITE_API_URL dans le fichier .env.',
        0,
        'config'
      )
    }
  }

  private async request<T>(fn: () => Promise<T>): Promise<T> {
    this.assertConfigured()
    try {
      return await fn()
    } catch (error) {
      throw classifyKioskError(error)
    }
  }

  async get<T>(endpoint: string, params?: Record<string, string | number | undefined>): Promise<T> {
    return this.request(async () => {
      const response = await this.send(this.buildUrl(endpoint, params), { method: 'GET' }, true)
      return this.handleResponse<T>(response)
    })
  }

  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request(async () => {
      const response = await this.send(
        this.buildUrl(endpoint),
        { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined },
        true
      )
      return this.handleResponse<T>(response)
    })
  }

  async patch<T>(endpoint: string, body: unknown): Promise<T> {
    return this.request(async () => {
      const response = await this.send(
        this.buildUrl(endpoint),
        { method: 'PATCH', body: JSON.stringify(body) },
        true
      )
      return this.handleResponse<T>(response)
    })
  }

  async del<T>(endpoint: string): Promise<T> {
    return this.request(async () => {
      const response = await this.send(this.buildUrl(endpoint), { method: 'DELETE' }, true)
      return this.handleResponse<T>(response)
    })
  }

  async upload<T>(endpoint: string, formData: FormData): Promise<T> {
    return this.request(async () => {
      // Pas de Content-Type : le navigateur pose lui-même la frontière multipart.
      const response = await this.send(
        this.buildUrl(endpoint),
        { method: 'POST', body: formData },
        false
      )
      return this.handleResponse<T>(response)
    })
  }
}

export const kioskClient = new KioskApiClient(`${import.meta.env.VITE_API_URL || ''}/kiosk-api`)
