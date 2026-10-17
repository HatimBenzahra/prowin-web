import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Download,
  SkipBack,
  SkipForward,
  Loader2,
} from 'lucide-react'
import WaveSurfer from 'wavesurfer.js'
import FFT from 'fft.js'

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2]

/* ── Biquad filter (Audio EQ Cookbook) ──────────────────────────────── */
function biquadCoeffs(type, f0, Q, fs) {
  const w0 = (2 * Math.PI * f0) / fs
  const cos = Math.cos(w0)
  const sin = Math.sin(w0)
  const alpha = sin / (2 * Q)
  let b0, b1, b2, a0, a1, a2
  if (type === 'lowpass') {
    b0 = (1 - cos) / 2
    b1 = 1 - cos
    b2 = (1 - cos) / 2
    a0 = 1 + alpha
    a1 = -2 * cos
    a2 = 1 - alpha
  } else {
    b0 = (1 + cos) / 2
    b1 = -(1 + cos)
    b2 = (1 + cos) / 2
    a0 = 1 + alpha
    a1 = -2 * cos
    a2 = 1 - alpha
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 }
}

function biquadProcess(x, c) {
  const y = new Float32Array(x.length)
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i]
    const y0 = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2
    y[i] = y0
    x2 = x1
    x1 = x0
    y2 = y1
    y1 = y0
  }
  return y
}

function percentile(sorted, p) {
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1))))
  return sorted[idx]
}

/* ── Hybrid VAD: bandpass + log-energy + spectral flatness + ZCR ─── */
function detectSpeechRegions(audioBuffer) {
  const pcm = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate
  const Q = 0.707

  // 1. Bandpass filter: HPF 200Hz + LPF 3400Hz (isolate speech band)
  const hp = biquadCoeffs('highpass', 200, Q, sampleRate)
  const lp = biquadCoeffs('lowpass', 3400, Q, sampleRate)
  const filtered = biquadProcess(biquadProcess(pcm, hp), lp)

  // 2. Frame analysis: 20ms frames, 10ms hop
  const frameMs = 20
  const hopMs = 10
  const frameLen = Math.max(1, Math.round((sampleRate * frameMs) / 1000))
  const hop = Math.max(1, Math.round((sampleRate * hopMs) / 1000))
  const eps = 1e-12

  // FFT size must be power of 2 >= frameLen
  const fftSize = 1 << Math.ceil(Math.log2(frameLen))
  const fft = new FFT(fftSize)
  const fftOut = fft.createComplexArray()
  const fftIn = new Array(fftSize).fill(0)

  const halfN = fftSize / 2

  const Edb = []
  const flatness = []
  const zcr = []

  for (let i = 0; i + frameLen <= filtered.length; i += hop) {
    // Log-energy on bandpass-filtered signal
    let sumsq = 0
    let signChanges = 0
    let prev = filtered[i]
    for (let j = 0; j < frameLen; j++) {
      const v = filtered[i + j]
      sumsq += v * v
      if (v >= 0 !== prev >= 0) signChanges++
      prev = v
    }
    Edb.push(10 * Math.log10(sumsq / frameLen + eps))
    zcr.push(signChanges / Math.max(1, frameLen - 1))

    // Spectral flatness on ORIGINAL signal (captures tonal structure)
    for (let j = 0; j < fftSize; j++) fftIn[j] = j < frameLen ? pcm[i + j] : 0
    fft.realTransform(fftOut, fftIn)

    let logSum = 0,
      linSum = 0
    for (let k = 1; k < halfN; k++) {
      const re = fftOut[2 * k]
      const im = fftOut[2 * k + 1]
      const mag = Math.sqrt(re * re + im * im) + eps
      logSum += Math.log(mag)
      linSum += mag
    }
    const geo = Math.exp(logSum / (halfN - 1))
    const arith = linSum / (halfN - 1)
    flatness.push(geo / arith) // low = tonal/speech, high = noise
  }

  if (Edb.length === 0) return []

  // 3. Adaptive threshold: p10 noise floor + SNR offset
  const sortedE = [...Edb].sort((a, b) => a - b)
  const p10 = percentile(sortedE, 0.1)
  const snrDb = 15
  const thr = Math.max(p10 + snrDb, -45)

  // 4. Frame classification: majority vote (3 features, need 2+)
  const zcrMin = 0.02
  const zcrMax = 0.2
  const flatnessMax = 0.4

  const raw = Edb.map((e, k) => {
    let votes = 0
    if (e > thr) votes++
    if (zcr[k] >= zcrMin && zcr[k] <= zcrMax) votes++
    if (flatness[k] < flatnessMax) votes++
    return votes >= 2
  })

  // 5. Debounce (3 frames to start) + hangover (5 frames to end)
  const startNeed = 3
  const hangFrames = 5
  const speech = new Array(raw.length).fill(false)
  let state = false,
    run = 0,
    hangLeft = 0

  for (let i = 0; i < raw.length; i++) {
    if (!state) {
      run = raw[i] ? run + 1 : 0
      if (run >= startNeed) {
        state = true
        hangLeft = hangFrames
        // Mark the start frames retroactively
        for (let b = i - startNeed + 1; b <= i; b++) speech[b] = true
      }
    } else {
      if (raw[i]) hangLeft = hangFrames
      else hangLeft--
      if (hangLeft < 0) {
        state = false
        run = 0
      } else speech[i] = true
    }
  }

  // 6. Convert frames → time segments
  const segments = []
  let inSeg = false,
    segStart = 0
  for (let i = 0; i < speech.length; i++) {
    if (speech[i] && !inSeg) {
      inSeg = true
      segStart = i
    }
    if (!speech[i] && inSeg) {
      inSeg = false
      segments.push({
        start: (segStart * hop) / sampleRate,
        end: (i * hop + frameLen) / sampleRate,
      })
    }
  }
  if (inSeg) {
    segments.push({
      start: (segStart * hop) / sampleRate,
      end: pcm.length / sampleRate,
    })
  }

  // 7. Cleanup: pad, merge gaps, drop short segments
  const padSec = 0.05
  const minDur = 0.25
  const mergeGap = 0.15
  const dur = pcm.length / sampleRate

  const cleaned = []
  for (const seg of segments) {
    const a = Math.max(0, seg.start - padSec)
    const b = Math.min(dur, seg.end + padSec)
    if (b - a < minDur) continue
    if (cleaned.length > 0 && a - cleaned[cleaned.length - 1].end <= mergeGap) {
      cleaned[cleaned.length - 1].end = b
    } else {
      cleaned.push({ start: a, end: b })
    }
  }

  return cleaned
}

// `compact` : forme basse (onde réduite), pour un lecteur épinglé en tête d'un panneau.
function AudioPlayer({ src, title, onDownload, onWavesurferReady, compact = false }) {
  const waveformRef = useRef(null)
  const wsRef = useRef(null)
  const containerRef = useRef(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [speechOverlays, setSpeechOverlays] = useState([])

  useEffect(() => {
    if (!waveformRef.current || !src) return

    setIsLoading(true)
    setIsReady(false)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)

    // Canvas can't resolve CSS custom properties; convert theme oklch to hex
    function resolveColor(cssVar, fallback) {
      const probe = document.createElement('div')
      probe.style.cssText = `color: var(--${cssVar}); display:none;`
      document.documentElement.appendChild(probe)
      const resolved = getComputedStyle(probe).color
      probe.remove()
      return resolved && resolved !== '' ? resolved : fallback
    }
    const primary = resolveColor('primary', '#818cf8')
    const mutedFg = resolveColor('muted-foreground', 'rgba(160,160,160,0.5)')

    setSpeechOverlays([])

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: mutedFg || 'rgba(160, 160, 160, 0.4)',
      progressColor: primary || '#818cf8',
      cursorColor: primary || '#818cf8',
      cursorWidth: 2,
      barWidth: 3,
      barGap: 1,
      barRadius: 2,
      height: compact ? 40 : 72,
      normalize: true,
      interact: true,
      dragToSeek: true,
      mediaControls: false,
      url: src,
    })

    ws.on('ready', dur => {
      setDuration(dur)
      setIsReady(true)
      setIsLoading(false)
      ws.setVolume(1)
      onWavesurferReady?.(ws)

      const decoded = ws.getDecodedData()
      if (decoded && dur > 0) {
        const parts = detectSpeechRegions(decoded)
        setSpeechOverlays(
          parts.map(r => ({
            left: (r.start / dur) * 100,
            width: ((r.end - r.start) / dur) * 100,
          }))
        )
      }
    })

    ws.on('timeupdate', time => {
      setCurrentTime(time)
    })

    ws.on('play', () => setIsPlaying(true))
    ws.on('pause', () => setIsPlaying(false))
    ws.on('finish', () => setIsPlaying(false))

    ws.on('loading', percent => {
      if (percent < 100) setIsLoading(true)
    })

    ws.on('error', () => {
      setIsLoading(false)
      setIsReady(false)
    })

    wsRef.current = ws

    return () => {
      ws.destroy()
      wsRef.current = null
    }
  }, [src, compact])

  const togglePlay = useCallback(() => {
    if (!wsRef.current || !isReady) return
    wsRef.current.playPause()
  }, [isReady])

  const skip = useCallback(
    seconds => {
      if (!wsRef.current || !isReady) return
      wsRef.current.skip(seconds)
    },
    [isReady]
  )

  const cycleSpeed = useCallback(() => {
    if (!wsRef.current) return
    const currentIdx = SPEED_OPTIONS.indexOf(playbackSpeed)
    const nextIdx = (currentIdx + 1) % SPEED_OPTIONS.length
    const newSpeed = SPEED_OPTIONS[nextIdx]
    const wasPlaying = wsRef.current.isPlaying()
    const time = wsRef.current.getCurrentTime()
    if (wasPlaying) wsRef.current.pause()
    wsRef.current.setPlaybackRate(newSpeed, true)
    wsRef.current.setTime(time)
    setPlaybackSpeed(newSpeed)
    if (wasPlaying) wsRef.current.play()
  }, [playbackSpeed])

  useEffect(() => {
    const onKeyDown = e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [togglePlay])

  const handleVolumeChange = useCallback(e => {
    const val = e.target.value / 100
    setVolume(val)
    if (wsRef.current) wsRef.current.setVolume(val)
    if (val > 0) setIsMuted(false)
  }, [])

  const toggleMute = useCallback(() => {
    if (!wsRef.current) return
    const next = !isMuted
    setIsMuted(next)
    wsRef.current.setMuted(next)
  }, [isMuted])

  const formatTime = useCallback(time => {
    if (!time || isNaN(time)) return '0:00'
    const h = Math.floor(time / 3600)
    const m = Math.floor((time % 3600) / 60)
    const s = Math.floor(time % 60)
      .toString()
      .padStart(2, '0')
    return h ? `${h}:${m.toString().padStart(2, '0')}:${s}` : `${m}:${s}`
  }, [])

  return (
    <div
      ref={containerRef}
      className={`bg-card text-card-foreground rounded-lg w-full ${compact ? 'p-2 space-y-2' : 'p-3 sm:p-4 space-y-3'}`}
    >
      {/* Header — en compact, le temps passe sur la ligne des commandes. */}
      {!compact && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-card-foreground truncate text-sm sm:text-base">
              {title}
            </h4>
            <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground tabular-nums">
              <span>{formatTime(currentTime)}</span>
              <span>/</span>
              <span>{formatTime(duration)}</span>
              {playbackSpeed !== 1 && (
                <span className="text-primary font-medium">{playbackSpeed}x</span>
              )}
            </div>
          </div>
          {onDownload && (
            <Button variant="outline" size="sm" onClick={onDownload} className="shrink-0">
              <Download className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}

      {/* Waveform */}
      <div className="w-full relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-card/60">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        )}
        <div ref={waveformRef} className="w-full" />
        {speechOverlays.map((r, i) => (
          <div
            key={i}
            className="absolute top-0 h-full rounded-sm pointer-events-none"
            style={{
              left: `${r.left}%`,
              width: `${r.width}%`,
              backgroundColor: 'rgba(239, 68, 68, 0.18)',
            }}
          />
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => skip(-10)}
            disabled={!isReady}
            className="h-8 w-8 p-0"
          >
            <SkipBack className="w-4 h-4" />
          </Button>

          <Button size="sm" onClick={togglePlay} disabled={!isReady} className="h-9 w-9 p-0">
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => skip(10)}
            disabled={!isReady}
            className="h-8 w-8 p-0"
          >
            <SkipForward className="w-4 h-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={cycleSpeed}
            className="h-7 px-2 text-xs font-semibold tabular-nums ml-1"
          >
            {playbackSpeed}x
          </Button>
          {compact && (
            <span className="ml-2 text-xs text-muted-foreground tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          )}
        </div>

        {/* Volume */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={toggleMute} className="h-8 w-8 p-0">
            {isMuted || volume === 0 ? (
              <VolumeX className="w-3.5 h-3.5" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
          </Button>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={isMuted ? 0 : volume * 100}
            onChange={handleVolumeChange}
            className="w-16 sm:w-20 h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
          />
        </div>
      </div>
    </div>
  )
}

export default AudioPlayer
