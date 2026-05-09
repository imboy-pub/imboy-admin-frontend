import '../test/setupDom'

import { describe, expect, it } from 'bun:test'
import { exportCsv, type CsvColumn } from './csvExport'

// Capture state for assertions
type DownloadCapture = {
  content: string
  filename: string
  anchorClicked: boolean
  blobRevoked: boolean
}

function withDownloadCapture(fn: (_capture: DownloadCapture) => void): DownloadCapture {
  const capture: DownloadCapture = {
    content: '',
    filename: '',
    anchorClicked: false,
    blobRevoked: false,
  }

  const origBlob = globalThis.Blob
  const origCreateObjectURL = URL.createObjectURL
  const origRevokeObjectURL = URL.revokeObjectURL
  const origCreateElement = document.createElement.bind(document)
  const origAppendChild = document.body.appendChild.bind(document.body)
  const origRemoveChild = document.body.removeChild.bind(document.body)

  // Intercept Blob to capture content
  globalThis.Blob = class MockBlob extends origBlob {
    constructor(parts: BlobPart[], options?: BlobPropertyBag) {
      super(parts, options)
      // Strip BOM (first char) for easier assertion
      capture.content = parts.map(String).join('')
    }
  } as typeof Blob

  URL.createObjectURL = () => 'blob:mock-url'
  URL.revokeObjectURL = () => { capture.blobRevoked = true }

  // Intercept anchor creation to capture filename and click
  document.createElement = ((tag: string) => {
    if (tag === 'a') {
      const el = origCreateElement('a') as HTMLAnchorElement
      const origClick = el.click.bind(el)
      el.click = () => {
        capture.filename = el.download
        capture.anchorClicked = true
        origClick()
      }
      return el
    }
    return origCreateElement(tag)
  }) as typeof document.createElement

  document.body.appendChild = ((child: Node) => {
    return origAppendChild(child)
  }) as typeof document.body.appendChild
  document.body.removeChild = ((child: Node) => {
    return origRemoveChild(child)
  }) as typeof document.body.removeChild

  try {
    fn(capture)
  } finally {
    globalThis.Blob = origBlob
    URL.createObjectURL = origCreateObjectURL
    URL.revokeObjectURL = origRevokeObjectURL
    document.createElement = origCreateElement
    document.body.appendChild = origAppendChild
    document.body.removeChild = origRemoveChild
  }

  return capture
}

type SimpleRow = { id: string; name: string }

describe('csvExport — generateCsv', () => {
  it('produces quoted header row and plain data row', () => {
    const columns: CsvColumn<SimpleRow>[] = [
      { header: '用户ID', accessor: 'id' },
      { header: '名称', accessor: 'name' },
    ]
    const rows: SimpleRow[] = [{ id: '101', name: 'Alice' }]

    const capture = withDownloadCapture(() => {
      exportCsv(columns, rows, 'users')
    })

    expect(capture.content).toContain('"用户ID"')
    expect(capture.content).toContain('"名称"')
    expect(capture.content).toContain('101')
    expect(capture.content).toContain('Alice')
    expect(capture.anchorClicked).toBe(true)
    expect(capture.filename).toMatch(/^users_\d{4}-\d{2}-\d{2}\.csv$/)
    expect(capture.blobRevoked).toBe(true)
  })

  it('handles empty rows — only header', () => {
    const columns: CsvColumn<SimpleRow>[] = [
      { header: 'ID', accessor: 'id' },
    ]

    const capture = withDownloadCapture(() => {
      exportCsv(columns, [], 'empty')
    })

    expect(capture.content).toContain('"ID"')
    expect(capture.anchorClicked).toBe(true)
  })

  it('handles null/undefined values as empty string', () => {
    type NullRow = { id: string; maybe: string | null | undefined }
    const columns: CsvColumn<NullRow>[] = [
      { header: 'ID', accessor: 'id' },
      { header: 'Maybe', accessor: (r) => r.maybe },
    ]
    const rows: NullRow[] = [
      { id: '1', maybe: null },
      { id: '2', maybe: undefined },
    ]

    const capture = withDownloadCapture(() => {
      exportCsv(columns, rows, 'null')
    })

    const lines = capture.content.replace(/^\uFEFF/, '').split('\n')
    // line[1] = "1",[empty]  — value after comma is empty
    expect(lines[1]).toBe('1,')
    expect(lines[2]).toBe('2,')
  })
})

describe('csvExport — CSV injection prevention', () => {
  const dangerousPrefixes = ['=', '+', '-', '@']

  for (const prefix of dangerousPrefixes) {
    it(`prefixes "${prefix}CMD" with single-quote to neutralise formula injection`, () => {
      type FormulaRow = { formula: string }
      const columns: CsvColumn<FormulaRow>[] = [
        { header: 'F', accessor: 'formula' },
      ]
      const rows: FormulaRow[] = [{ formula: `${prefix}CMD` }]

      const capture = withDownloadCapture(() => {
        exportCsv(columns, rows, 'injection')
      })

      expect(capture.content).toContain(`'${prefix}CMD`)
    })
  }
})

describe('csvExport — RFC 4180 quoting', () => {
  it('wraps values containing commas in double quotes', () => {
    type V = { v: string }
    const columns: CsvColumn<V>[] = [{ header: 'V', accessor: 'v' }]
    const rows: V[] = [{ v: 'a,b,c' }]

    const capture = withDownloadCapture(() => {
      exportCsv(columns, rows, 'comma')
    })

    expect(capture.content).toContain('"a,b,c"')
  })

  it('doubles embedded double-quotes per RFC 4180', () => {
    type V = { v: string }
    const columns: CsvColumn<V>[] = [{ header: 'V', accessor: 'v' }]
    const rows: V[] = [{ v: 'say "hello"' }]

    const capture = withDownloadCapture(() => {
      exportCsv(columns, rows, 'dquote')
    })

    expect(capture.content).toContain('"say ""hello"""')
  })

  it('wraps values containing newlines in double quotes', () => {
    type V = { v: string }
    const columns: CsvColumn<V>[] = [{ header: 'V', accessor: 'v' }]
    const rows: V[] = [{ v: 'line1\nline2' }]

    const capture = withDownloadCapture(() => {
      exportCsv(columns, rows, 'newline')
    })

    expect(capture.content).toContain('"line1\nline2"')
  })
})

describe('csvExport — function accessor', () => {
  it('uses function accessor to derive value', () => {
    type AmountRow = { id: string; amount: number }
    const columns: CsvColumn<AmountRow>[] = [
      { header: 'ID', accessor: 'id' },
      { header: '金额', accessor: (row) => (row.amount / 100).toFixed(2) },
    ]
    const rows: AmountRow[] = [{ id: '1', amount: 15000 }]

    const capture = withDownloadCapture(() => {
      exportCsv(columns, rows, 'amount')
    })

    expect(capture.content).toContain('150.00')
  })
})

describe('csvExport — BOM', () => {
  it('prepends UTF-8 BOM (\\uFEFF) for Excel compatibility', () => {
    type V = { v: string }
    const columns: CsvColumn<V>[] = [{ header: 'V', accessor: 'v' }]
    const rows: V[] = [{ v: 'hi' }]

    const capture = withDownloadCapture(() => {
      exportCsv(columns, rows, 'bom')
    })

    expect(capture.content.charCodeAt(0)).toBe(0xFEFF)
  })
})
