import { graphqlClient } from '../../core/graphql'
import { logger as Logger } from '../../core/graphql'
import type { RecordingData, EnrichedRecording } from './recording.types'

// GraphQL Queries pour les enregistrements
const LIST_RECORDINGS = `
  query ListRecordings($roomName: String!) {
    listRecordings(roomName: $roomName) {
      key
      size
      lastModified
      url
    }
  }
`

const GET_STREAMING_URL = `
  query GetStreamingUrl($key: String!) {
    getStreamingUrl(key: $key)
  }
`

const LIST_RECENT_RECORDINGS = `
  query ListRecentRecordings($input: ListRecentRecordingsInput!) {
    listRecentRecordings(input: $input) {
      items {
        key
        size
        lastModified
      }
      totalCount
    }
  }
`

const GET_SPEECH_SCORES = `
  query GetRecordingSpeechScores($keys: [String!]!) {
    getRecordingSpeechScores(keys: $keys) {
      key
      score
      totalDurationSec
      speechDurationSec
      status
    }
  }
`

export class RecordingService {
  /**
   * Récupère la liste des enregistrements pour un utilisateur (commercial ou manager)
   * @param {number} userId - ID de l'utilisateur
   * @param {string} userType - Type d'utilisateur ('commercial' ou 'manager')
   * @returns {Promise<Array>} Liste des enregistrements filtrés (uniquement .mp4)
   */
  static async getRecordingsForUser(
    userId: number,
    userType: string
  ): Promise<EnrichedRecording[]> {
    try {
      // Le backend et les clés S3 attendent le format room:<userType>:<id>
      // (le service backend remplace les deux-points par des underscores pour le stockage)
      const roomName = `room:${userType.toLowerCase()}:${userId}`
      console.log(
        '🔍 Recherche enregistrements pour roomName:',
        roomName,
        `(${userType} ID: ${userId})`
      )

      const data = await graphqlClient.request(LIST_RECORDINGS, {
        roomName,
      })

      console.log('📦 Données reçues de S3:', data)
      console.log('📋 Liste brute:', data.listRecordings)

      // Filtrer uniquement les fichiers .mp4
      const recordings: RecordingData[] = data.listRecordings.filter(
        (recording: RecordingData) =>
          recording.key && recording.key.toLowerCase().endsWith('.mp4')
      )

      console.log('🎬 Fichiers .mp4 filtrés:', recordings)

      // Enrichir les données pour l'affichage (sans charger les URLs immédiatement)
      const enrichedRecordings: EnrichedRecording[] = recordings.map(
        (recording: RecordingData) => ({
          id: recording.key,
          key: recording.key,
          url: null, // On charge l'URL seulement quand on clique sur "Écouter"
          rawUrl: recording.url, // Garde l'URL originale pour lazy loading
          size: recording.size,
          lastModified: recording.lastModified,
          // Extraire des infos du nom de fichier si possible
          filename: recording.key.split('/').pop() || '',
          date: recording.lastModified
            ? new Date(recording.lastModified).toLocaleDateString()
            : '',
          time: recording.lastModified
            ? new Date(recording.lastModified).toLocaleTimeString()
            : '',
          duration: this.formatFileSize(recording.size), // On affiche la taille en attendant la vraie durée
          userId,
          userType,
        })
      )

      console.log('✨ Enregistrements enrichis:', enrichedRecordings)
      return enrichedRecordings
    } catch (error) {
      console.error('❌ Erreur récupération enregistrements:', error)
      throw error
    }
  }

  /**
   * Formate la taille du fichier en format lisible
   */
  static formatFileSize(bytes: number): string {
    if (!bytes) return '0 B'

    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))

    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
  }

  /**
   * Génère une URL optimisée pour le streaming
   */
  static async getStreamingUrl(key: string): Promise<string> {
    try {
      const data = await graphqlClient.request(GET_STREAMING_URL, { key })
      return data.getStreamingUrl
    } catch (error) {
      Logger.debug('Erreur génération URL streaming:', error)
      throw error
    }
  }

  static async getRecentRecordings(
    limit = 60
  ): Promise<{ items: RecordingData[]; totalCount: number }> {
    try {
      const data = await graphqlClient.request(LIST_RECENT_RECORDINGS, {
        input: { limit },
      })
      const result = data.listRecentRecordings
      const filteredItems = (result.items || []).filter(
        (r: RecordingData) => r.key && r.key.toLowerCase().endsWith('.mp4')
      )
      return { items: filteredItems, totalCount: result.totalCount || filteredItems.length }
    } catch (error) {
      console.error('Erreur récupération enregistrements récents:', error)
      throw error
    }
  }

  static async getSpeechScores(
    keys: string[]
  ): Promise<Array<{ key: string; score?: number; totalDurationSec?: number; speechDurationSec?: number; status: string }>> {
    try {
      const data = await graphqlClient.request(GET_SPEECH_SCORES, { keys })
      return data.getRecordingSpeechScores || []
    } catch {
      return []
    }
  }

  /**
   * Télécharge un enregistrement
   */
  static downloadRecording(url: string, filename?: string): void {
    if (!url) return

    const link = document.createElement('a')
    link.href = url
    link.download = filename || 'recording.mp4'
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
}

export default RecordingService
