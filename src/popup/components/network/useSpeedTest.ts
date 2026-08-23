import { useCallback, useEffect, useRef, useState } from 'react'

// Speedtest.net-style on-demand test against Cloudflare's public endpoints.
// Extensions can't observe device traffic, so this measures active probes:
//   ping     — best of 3 zero-byte round trips
//   download — stream 25MB, hard-capped at 7s; live AND final rate come from
//              an ~800ms sliding window over (time, bytes) samples, so TCP
//              ramp-up doesn't drag the reported number down
//   upload   — 8 x 256KB POSTs, per-chunk instantaneous rate for live feel
const BASE = 'https://speed.cloudflare.com'
const DOWN_URL = `${BASE}/__down?bytes=26214400`
const DOWNLOAD_MAX_MS = 7000
// Ping and upload chunks had no cap at all — one hung request left the gauge
// spinning in 'testing' forever (reopening the panel early-returned).
const PING_MAX_MS = 5000
const UPLOAD_CHUNK_MAX_MS = 8000
const UPLOAD_CHUNK_BYTES = 256 * 1024
const UPLOAD_CHUNKS = 8

export type TestPhase = 'idle' | 'ping' | 'download' | 'upload' | 'done'

export interface SpeedTestState {
  phase: TestPhase
  liveMbps: number
  pingMs: number | null
  downMbps: number | null
  upMbps: number | null
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function useSpeedTest() {
  const [state, setState] = useState<SpeedTestState>({
    phase: 'idle', liveMbps: 0, pingMs: null, downMbps: null, upMbps: null,
  })
  const busy = useRef(false)
  // Aborted when the popup unmounts (tab switch) — the orphaned fetch loop
  // used to keep writing state after the component was gone.
  useEffect(() => () => { aborted.current = true }, [])
  const aborted = useRef(false)

  const run = useCallback(async () => {
    if (busy.current || aborted.current) return
    busy.current = true
    try {
      setState(s => ({ ...s, phase: 'ping', liveMbps: 0 }))

      // --- PING ---
      let bestRtt = Infinity
      for (let i = 0; i < 3; i++) {
        if (aborted.current) return
        try {
          const t0 = performance.now()
          await fetch(`${BASE}/__down?bytes=0`, { cache: 'no-store', signal: AbortSignal.timeout(PING_MAX_MS) })
          bestRtt = Math.min(bestRtt, performance.now() - t0)
        } catch { continue } // one failed probe must not kill best-of-3
      }
      const pingMs = isFinite(bestRtt) ? Math.round(bestRtt) : null
      setState(s => ({ ...s, pingMs }))

      // --- DOWNLOAD (live) ---
      setState(s => ({ ...s, phase: 'download', liveMbps: 0 }))
      let steadyMbps = 0
      const aborter = new AbortController()
      const cap = setTimeout(() => aborter.abort(), DOWNLOAD_MAX_MS)
      const start = performance.now()
      let bytes = 0
      const samples: { t: number; b: number }[] = []
      let lastLive = 0
      try {
        const res = await fetch(DOWN_URL, { cache: 'no-store', signal: aborter.signal })
        const reader = res.body?.getReader()
        if (!reader) throw new Error('no stream')
        for (;;) {
          if (aborted.current) { aborter.abort(); break }
          const { done, value } = await reader.read()
          if (done) break
          bytes += value.length
          const now = performance.now()
          samples.push({ t: now, b: bytes })
          while (samples.length > 2 && now - samples[0].t > 800) samples.shift()
          if (now - lastLive > 150 && samples.length >= 2) {
            const first = samples[0]
            const mbps = ((bytes - first.b) * 8) / ((now - first.t) / 1000) / 1e6
            if (isFinite(mbps) && mbps > 0) {
              steadyMbps = mbps
              setState(s => ({ ...s, liveMbps: round1(mbps) }))
            }
            lastLive = now
          }
        }
      } catch {
        // time cap fires AbortError here — expected on fast links
      }
      clearTimeout(cap)
      const dlSecs = (performance.now() - start) / 1000
      const avgFallback = dlSecs > 0.05 ? (bytes * 8) / dlSecs / 1e6 : 0
      const downMbps = steadyMbps > 0 ? round1(steadyMbps) : avgFallback > 0 ? round1(avgFallback) : null

      // --- UPLOAD (live via chunked POSTs) ---
      setState(s => ({ ...s, phase: 'upload', liveMbps: 0, downMbps }))
      let upMbps: number | null = null
      try {
        const payload = new Uint8Array(UPLOAD_CHUNK_BYTES)
        let sent = 0
        const upStart = performance.now()
        for (let i = 0; i < UPLOAD_CHUNKS; i++) {
          if (aborted.current) return
          const t0 = performance.now()
          await fetch(`${BASE}/__up`, { method: 'POST', body: payload, cache: 'no-store', signal: AbortSignal.timeout(UPLOAD_CHUNK_MAX_MS) })
          sent += UPLOAD_CHUNK_BYTES
          const dt = (performance.now() - t0) / 1000
          if (dt > 0) setState(s => ({ ...s, liveMbps: round1((UPLOAD_CHUNK_BYTES * 8) / dt / 1e6) }))
        }
        const upSecs = (performance.now() - upStart) / 1000
        if (upSecs > 0.05) upMbps = round1((sent * 8) / upSecs / 1e6)
      } catch { /* upload endpoint unreachable — leave result null */ }

      if (aborted.current) return
      setState(s => ({ ...s, phase: 'done', liveMbps: 0, upMbps }))
    } finally {
      busy.current = false
    }
  }, [])

  return { ...state, run }
}
