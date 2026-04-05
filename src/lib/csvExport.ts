/**
 * 通用 CSV 导出工具
 *
 * 用法:
 *   import { exportCsv, downloadBlob } from '@/lib/csvExport'
 *
 *   const columns = [
 *     { header: '用户ID', accessor: 'id' },
 *     { header: '昵称', accessor: (row) => row.nickname || '-' },
 *   ]
 *   exportCsv(columns, users, 'users_export')
 */

type Accessor<T> = string | ((row: T) => string | number | null | undefined)

export interface CsvColumn<T> {
  header: string
  accessor: Accessor<T>
}

function resolveValue<T>(row: T, accessor: Accessor<T>): string {
  const raw = typeof accessor === 'function' ? accessor(row) : (row as Record<string, unknown>)[accessor]
  if (raw == null) return ''
  const str = String(raw)
  // 包含逗号、双引号、换行符时需要用双引号包裹
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function generateCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const headerLine = columns.map((col) => `"${col.header}"`).join(',')
  const dataLines = rows.map((row) =>
    columns.map((col) => resolveValue(row, col.accessor)).join(',')
  )
  return [headerLine, ...dataLines].join('\n')
}

export function downloadBlob(content: string, filename: string, mimeType = 'text/csv;charset=utf-8'): void {
  const bom = '\uFEFF' // UTF-8 BOM，确保 Excel 正确识别中文
  const blob = new Blob([bom + content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function exportCsv<T>(columns: CsvColumn<T>[], rows: T[], filenamePrefix: string): void {
  const csv = generateCsv(columns, rows)
  const timestamp = new Date().toISOString().slice(0, 10)
  downloadBlob(csv, `${filenamePrefix}_${timestamp}.csv`)
}
