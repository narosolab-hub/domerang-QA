'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { bulkCreateRequirements } from '@/lib/queries'
import type { System } from '@/lib/types'
import { Upload, FileSpreadsheet } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  systems: System[]
  onSuccess: () => void
}

// 헤더명으로 컬럼 인덱스 찾기 (부분 매칭, 대소문자 무시)
function findColIndex(headers: string[], ...keywords: string[]): number {
  return headers.findIndex(h =>
    keywords.some(kw => h?.toString().toLowerCase().includes(kw.toLowerCase()))
  )
}

function parseRows(rows: string[][]): {
  colMap: Record<string, number>
  dataRows: string[][]
  headerRow: string[]
} {
  if (rows.length === 0) return { colMap: {}, dataRows: [], headerRow: [] }

  // 헤더 행 찾기: "depth" 또는 "기능" 포함된 행
  let headerIdx = rows.findIndex(row =>
    row.some(c => /depth|기능|feature/i.test(c?.toString() ?? ''))
  )
  if (headerIdx === -1) headerIdx = 0 // 못 찾으면 첫 행을 헤더로

  const headerRow = rows[headerIdx].map(c => c?.toString().trim() ?? '')
  const dataRows = rows.slice(headerIdx + 1)

  const colMap: Record<string, number> = {
    depth_0:      findColIndex(headerRow, '0depth', '0 depth'),
    depth_1:      findColIndex(headerRow, '1depth', '1 depth'),
    depth_2:      findColIndex(headerRow, '2depth', '2 depth'),
    depth_3:      findColIndex(headerRow, '3depth', '3 depth'),
    feature_name: findColIndex(headerRow, '기능', 'feature'),
    original_spec: findColIndex(headerRow, '상세', 'detail', 'spec'),
  }

  return { colMap, dataRows, headerRow }
}

// 병합 셀(merged cell) 대응: 상위 depth 값을 하위 빈 행에 채워 내림
// depth_0 바뀌면 depth_1/2/3 초기화, depth_1 바뀌면 depth_2/3 초기화
function fillDownDepth(rows: string[][], colMap: Record<string, number>): string[][] {
  const depthKeys = ['depth_0', 'depth_1', 'depth_2', 'depth_3'] as const
  const idxs = depthKeys.map(k => colMap[k])
  const last = ['', '', '', '']

  return rows.map(row => {
    const filled = [...row]
    for (let d = 0; d < 4; d++) {
      const idx = idxs[d]
      if (idx < 0) continue
      const val = filled[idx]?.toString().trim() ?? ''
      if (val) {
        // 새 값이 생기면 하위 depth 초기화
        last[d] = val
        for (let j = d + 1; j < 4; j++) last[j] = ''
      } else if (last[d]) {
        // 빈 칸이면 마지막 값으로 채움
        filled[idx] = last[d]
      }
    }
    return filled
  })
}

function mapRow(row: string[], colMap: Record<string, number>, systemId: string) {
  const get = (key: string) => {
    const idx = colMap[key]
    return (idx >= 0 ? row[idx]?.toString().trim() : '') || undefined
  }
  return {
    system_id:     systemId,
    depth_0:       get('depth_0'),
    depth_1:       get('depth_1'),
    depth_2:       get('depth_2'),
    depth_3:       get('depth_3'),
    feature_name:  get('feature_name'),
    original_spec: get('original_spec'),
  }
}

export function UploadModal({ open, onClose, systems, onSuccess }: Props) {
  const [systemId, setSystemId] = useState('')
  const [preview, setPreview] = useState<string[][] | null>(null)
  const [colMap, setColMap] = useState<Record<string, number>>({})
  const [headerRow, setHeaderRow] = useState<string[]>([])
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (file: File) => {
    setError('')
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        // defval: '' 로 빈 셀도 빈 문자열로 채움
        const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: '',
          raw: false,
        }) as string[][]

        const { colMap: cm, dataRows, headerRow: hr } = parseRows(rows)

        if (!dataRows.length) {
          setError('데이터가 없습니다. 파일을 확인해주세요.')
          return
        }
        if (cm.feature_name === -1 && cm.depth_0 === -1) {
          setError('컬럼을 인식하지 못했습니다. 헤더에 "기능" 또는 "Depth" 문자가 있는지 확인해주세요.')
          return
        }

        // 병합 셀 fill-down 처리
        const filledRows = fillDownDepth(dataRows, cm)

        setColMap(cm)
        setHeaderRow(hr)
        setPreview(filledRows)
      } catch (e) {
        setError('파일 파싱 실패: ' + (e instanceof Error ? e.message : String(e)))
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleUpload = async () => {
    if (!systemId) { setError('시스템을 선택해주세요.'); return }
    if (!preview || preview.length === 0) { setError('먼저 파일을 업로드해주세요.'); return }

    setLoading(true)
    try {
      const items = preview
        .filter(row => row.some(c => c?.toString().trim()))
        .map(row => mapRow(row, colMap, systemId))
        .filter(item => !!item.original_spec)  // 상세 있는 행만 (depth 구분선·빈 행 제외)

      if (items.length === 0) {
        setError('파싱된 항목이 없습니다. 컬럼 매핑을 확인해주세요.')
        return
      }

      const count = await bulkCreateRequirements(items)
      onSuccess()
      handleClose()
      alert(`${count}개 항목이 업로드되었습니다.`)
    } catch (e) {
      setError('업로드 실패: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setPreview(null)
    setColMap({})
    setHeaderRow([])
    setFileName('')
    setSystemId('')
    setError('')
    onClose()
  }

  const PREVIEW_COLS: { key: string; label: string }[] = [
    { key: 'depth_0', label: '0Depth' },
    { key: 'depth_1', label: '1Depth' },
    { key: 'depth_2', label: '2Depth' },
    { key: 'depth_3', label: '3Depth' },
    { key: 'feature_name', label: '기능명' },
    { key: 'original_spec', label: '상세' },
  ]

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>요구사항 업로드</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* 시스템 선택 */}
          <div>
            <label className="text-sm font-medium mb-1 block">시스템 선택</label>
            <Select value={systemId} onValueChange={setSystemId}>
              <SelectTrigger>
                <SelectValue placeholder="시스템을 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {systems.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 파일 업로드 영역 */}
          <div>
            <label className="text-sm font-medium mb-1 block">엑셀 파일 선택</label>
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
            >
              {fileName ? (
                <div className="flex items-center justify-center gap-2 text-green-600">
                  <FileSpreadsheet className="h-5 w-5" />
                  <span className="text-sm font-medium">{fileName}</span>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">클릭하거나 파일을 여기로 드래그</p>
                  <p className="text-xs text-gray-400 mt-1">.xlsx · .xls · .csv 지원</p>
                </>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
                e.target.value = ''
              }}
            />
          </div>

          {/* 컬럼 매핑 결과 */}
          {headerRow.length > 0 && (
            <div className="bg-gray-50 rounded p-3 text-xs space-y-1">
              <p className="font-medium text-gray-600 mb-1.5">컬럼 자동 매핑 결과</p>
              <div className="flex flex-wrap gap-2">
                {PREVIEW_COLS.map(({ key, label }) => {
                  const idx = colMap[key]
                  const found = idx >= 0
                  return (
                    <span
                      key={key}
                      className={`px-2 py-0.5 rounded border text-xs ${
                        found
                          ? 'bg-green-50 border-green-300 text-green-700'
                          : 'bg-gray-100 border-gray-200 text-gray-400'
                      }`}
                    >
                      {label}: {found ? `"${headerRow[idx]}"` : '미감지'}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* 미리보기 */}
          {preview && (
            <div>
              <p className="text-sm font-medium mb-1">
                미리보기 ({preview.map(r => mapRow(r, colMap, systemId)).filter(item => !!item.original_spec).length}개 항목)
              </p>
              <div className="border rounded overflow-auto max-h-52">
                <table className="text-xs w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {PREVIEW_COLS.map(({ label }) => (
                        <th key={label} className="px-2 py-1 text-left border-b font-medium whitespace-nowrap">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 20).map((row, i) => {
                      const mapped = mapRow(row, colMap, systemId)
                      if (!mapped.original_spec) return null
                      return (
                        <tr key={i} className="border-b hover:bg-gray-50">
                          <td className="px-2 py-1 text-gray-500">{mapped.depth_0 ?? ''}</td>
                          <td className="px-2 py-1 text-gray-500">{mapped.depth_1 ?? ''}</td>
                          <td className="px-2 py-1 text-gray-500">{mapped.depth_2 ?? ''}</td>
                          <td className="px-2 py-1 text-gray-500">{mapped.depth_3 ?? ''}</td>
                          <td className="px-2 py-1 font-medium">{mapped.feature_name ?? ''}</td>
                          <td className="px-2 py-1 text-gray-500 max-w-[180px] truncate">{mapped.original_spec ?? ''}</td>
                        </tr>
                      )
                    })}
                    {preview.length > 20 && (
                      <tr>
                        <td colSpan={6} className="px-2 py-1 text-gray-400 text-center">
                          ... 외 {preview.length - 20}개
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={handleClose}>취소</Button>
            <Button onClick={handleUpload} disabled={loading || !preview}>
              {loading ? '업로드 중...' : preview ? `업로드 (${preview.map(r => mapRow(r, colMap, systemId)).filter(item => !!item.original_spec).length}개)` : '파일을 선택하세요'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
