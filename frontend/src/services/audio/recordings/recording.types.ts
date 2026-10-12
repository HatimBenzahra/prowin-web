/**
 * Types for Recording Service
 */

export interface RecordingData {
  key: string
  size: number
  lastModified: string
  url?: string
}

export interface EnrichedRecording {
  id: string
  key: string
  url: string | null
  rawUrl: string
  size: number
  lastModified: string
  filename: string
  date: string
  time: string
  duration: string
  userId: number
  userType: string
}

export interface StartRecordingInput {
  roomName: string
  audioOnly?: boolean
  immeubleId?: number | null
}

export interface StartRecordingResponse {
  egressId: string
  roomName: string
  status: string
  s3Key: string
  url: string
}

export interface StopRecordingInput {
  egressId: string
}
