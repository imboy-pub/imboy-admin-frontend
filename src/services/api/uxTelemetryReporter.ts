import { UX_EVENT_DISPATCH } from '@/lib/uxTelemetry'

type UxEventRecord = {
  event: string
  payload: Record<string, unknown>
  timestamp: string
}

type UxEventEnvelope = {
  events: UxEventRecord[]
}

type ReportError = Error & {
  status?: number
}

const DEFAULT_UX_REPORT_URL = '/adm/admin/ux/events'
const FLUSH_INTERVAL_MS = 5000
const MAX_QUEUE_SIZE = 200
const MAX_BATCH_SIZE = 20

let started = false
let disabledForSession = false
let flushing = false
let queue: UxEventRecord[] = []
let flushTimer: number | null = null

function resolveReportUrl(): string {
  const envUrl = typeof import.meta.env.VITE_UX_EVENT_REPORT_URL === 'string'
    ? import.meta.env.VITE_UX_EVENT_REPORT_URL.trim()
    : ''
  return envUrl || DEFAULT_UX_REPORT_URL
}

function normalizeRecord(raw: unknown): UxEventRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const detail = raw as Partial<UxEventRecord>
  if (typeof detail.event !== 'string' || detail.event.trim().length === 0) return null
  return {
    event: detail.event.trim(),
    payload: (detail.payload && typeof detail.payload === 'object'
      ? detail.payload
      : {}) as Record<string, unknown>,
    timestamp: typeof detail.timestamp === 'string' ? detail.timestamp : new Date().toISOString(),
  }
}

function enqueue(record: UxEventRecord) {
  if (disabledForSession) return
  queue.push(record)
  if (queue.length > MAX_QUEUE_SIZE) {
    queue = queue.slice(queue.length - MAX_QUEUE_SIZE)
  }
}

function clearFlushTimer() {
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer)
    flushTimer = null
  }
}

function scheduleFlush() {
  if (flushTimer !== null || disabledForSession) return
  flushTimer = window.setTimeout(() => {
    flushTimer = null
    void flushQueue('timer')
  }, FLUSH_INTERVAL_MS)
}

async function postEvents(url: string, events: UxEventRecord[]) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    keepalive: true,
    body: JSON.stringify({ events } satisfies UxEventEnvelope),
  })

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`) as ReportError
    error.status = response.status
    throw error
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) return

  const data = await response.json().catch(() => null)
  if (!data || typeof data !== 'object') return

  const record = data as Record<string, unknown>
  if ('code' in record) {
    const code = Number(record.code)
    if (Number.isFinite(code) && code !== 0) {
      const message = typeof record.msg === 'string' ? record.msg : 'ux telemetry rejected'
      throw new Error(message)
    }
  }
}

async function flushQueue(reason: 'timer' | 'threshold' | 'pagehide') {
  if (disabledForSession || flushing || queue.length === 0) return
  flushing = true
  clearFlushTimer()

  const reportUrl = resolveReportUrl()

  try {
    if (reason === 'pagehide' && typeof navigator.sendBeacon === 'function') {
      const payload = JSON.stringify({ events: queue } satisfies UxEventEnvelope)
      const blob = new Blob([payload], { type: 'application/json' })
      const sent = navigator.sendBeacon(reportUrl, blob)
      if (sent) {
        queue = []
        return
      }
    }

    while (queue.length > 0) {
      const batch = queue.slice(0, MAX_BATCH_SIZE)
      await postEvents(reportUrl, batch)
      queue = queue.slice(batch.length)
    }
  } catch (error) {
    const status = (error as ReportError)?.status
    if (status === 404 || status === 405) {
      disabledForSession = true
      queue = []
    }
  } finally {
    flushing = false
    if (queue.length > 0 && !disabledForSession) {
      scheduleFlush()
    }
  }
}

function handleUxEventDispatch(event: Event) {
  const customEvent = event as CustomEvent
  const record = normalizeRecord(customEvent?.detail)
  if (!record) return

  enqueue(record)
  if (queue.length >= MAX_BATCH_SIZE) {
    void flushQueue('threshold')
    return
  }
  scheduleFlush()
}

function handlePageHide() {
  void flushQueue('pagehide')
}

export function startUxEventReporter() {
  if (typeof window === 'undefined' || started) return
  started = true

  window.addEventListener(UX_EVENT_DISPATCH, handleUxEventDispatch)
  window.addEventListener('pagehide', handlePageHide)
  window.addEventListener('beforeunload', handlePageHide)
}

