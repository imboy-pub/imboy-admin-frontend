import type { ReactNode } from 'react'

export function parsePayload(payload: string): { display: string; isJson: boolean; parsed: unknown } {
  if (!payload) {
    return { display: '-', isJson: false, parsed: null }
  }
  try {
    const parsed = JSON.parse(payload) as unknown
    return { display: JSON.stringify(parsed, null, 2), isJson: true, parsed }
  } catch {
    return { display: payload, isJson: false, parsed: payload }
  }
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function formatPrimitive(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`
  }
  if (value === null) {
    return 'null'
  }
  return String(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function highlightText(text: string, keyword: string): ReactNode {
  const target = keyword.trim()
  if (!target) {
    return text
  }

  const escaped = escapeRegExp(target)
  const regex = new RegExp(`(${escaped})`, 'gi')
  const parts = text.split(regex)

  return parts.map((part, index) => {
    if (part.toLowerCase() === target.toLowerCase()) {
      return (
        <mark key={`${part}-${index}`} className="rounded bg-yellow-200 px-0.5 text-black">
          {part}
        </mark>
      )
    }
    return <span key={`${part}-${index}`}>{part}</span>
  })
}

interface JsonTreeProps {
  value: unknown
  keyword: string
  depth?: number
}

export function JsonTree({ value, keyword, depth = 0 }: JsonTreeProps) {
  const style = { marginLeft: depth * 12 }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <div style={style} className="text-xs text-muted-foreground">
          []
        </div>
      )
    }
    return (
      <div style={style} className="space-y-1">
        {value.map((item, idx) => (
          <div key={`arr-${depth}-${idx}`} className="space-y-1">
            <div className="text-xs text-muted-foreground">[{idx}]</div>
            <JsonTree value={item} keyword={keyword} depth={depth + 1} />
          </div>
        ))}
      </div>
    )
  }

  if (isRecord(value)) {
    const entries = Object.entries(value)
    if (entries.length === 0) {
      return (
        <div style={style} className="text-xs text-muted-foreground">
          {'{}'}
        </div>
      )
    }
    return (
      <div style={style} className="space-y-1">
        {entries.map(([key, child], idx) => (
          <div key={`obj-${depth}-${key}-${idx}`} className="space-y-1">
            <div className="text-xs">
              <span className="font-semibold text-sky-700">{highlightText(key, keyword)}</span>
              <span className="text-muted-foreground">: </span>
            </div>
            <JsonTree value={child} keyword={keyword} depth={depth + 1} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={style} className="text-xs">
      {highlightText(formatPrimitive(value), keyword)}
    </div>
  )
}
