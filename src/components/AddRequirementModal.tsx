'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createRequirement, getDepthValues } from '@/lib/queries'
import type { System, Priority } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  systems: System[]
  onSuccess: () => void
}

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: '높음', label: '🔴 높음' },
  { value: '중간', label: '🟡 중간' },
  { value: '낮음', label: '🔵 낮음' },
]

export function AddRequirementModal({ open, onClose, systems, onSuccess }: Props) {
  const [systemId, setSystemId] = useState('')
  const [depth0, setDepth0] = useState('')
  const [depth1, setDepth1] = useState('')
  const [depth2, setDepth2] = useState('')
  const [depth3, setDepth3] = useState('')
  const [featureName, setFeatureName] = useState('')
  const [originalSpec, setOriginalSpec] = useState('')
  const [priority, setPriority] = useState<Priority | ''>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Depth 옵션 (기존 DB 값 기반)
  const [depth0Options, setDepth0Options] = useState<string[]>([])
  const [depth1ByParent, setDepth1ByParent] = useState<Record<string, string[]>>({})
  const [depth2Options, setDepth2Options] = useState<string[]>([])

  useEffect(() => {
    if (!systemId) return
    getDepthValues(systemId).then(({ depth_0, depth_1ByParent }) => {
      setDepth0Options(depth_0)
      setDepth1ByParent(depth_1ByParent)
    })
  }, [systemId])

  // depth_1 변경 시 depth_2 옵션 업데이트
  useEffect(() => {
    if (!depth0 || !depth1) { setDepth2Options([]); return }
    // depth_1 하위 depth_2는 별도 쿼리 없이 일단 빈 배열 (직접 입력 유도)
    setDepth2Options([])
  }, [depth0, depth1])

  const depth1Options = depth0 ? (depth1ByParent[depth0] ?? []) : []

  const handleSubmit = async () => {
    if (!systemId) { setError('시스템을 선택해주세요.'); return }
    if (!featureName.trim() && !originalSpec.trim()) {
      setError('기능명 또는 상세 중 하나는 입력해주세요.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await createRequirement({
        system_id: systemId,
        depth_0: depth0.trim() || undefined,
        depth_1: depth1.trim() || undefined,
        depth_2: depth2.trim() || undefined,
        depth_3: depth3.trim() || undefined,
        feature_name: featureName.trim() || undefined,
        original_spec: originalSpec.trim() || undefined,
        ...(priority ? { priority } : {}),
      })
      onSuccess()
      handleClose()
    } catch (e) {
      setError('저장 실패: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setSystemId('')
    setDepth0('')
    setDepth1('')
    setDepth2('')
    setDepth3('')
    setFeatureName('')
    setOriginalSpec('')
    setPriority('')
    setError('')
    setDepth0Options([])
    setDepth1ByParent({})
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>요구사항 신규 추가</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* 시스템 */}
          <div>
            <label className="text-sm font-medium mb-1 block">시스템 <span className="text-red-500">*</span></label>
            <Select value={systemId} onValueChange={v => { setSystemId(v); setDepth0(''); setDepth1('') }}>
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

          {/* Depth 경로 */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">경로 (Depth)</label>
            <div className="space-y-2">
              {/* 0Depth */}
              <div className="flex gap-2 items-center">
                <span className="text-xs text-gray-400 w-14 shrink-0">0Depth</span>
                {depth0Options.length > 0 ? (
                  <Select value={depth0} onValueChange={v => { setDepth0(v === '__new__' ? '' : v); setDepth1('') }}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="선택 또는 직접 입력" />
                    </SelectTrigger>
                    <SelectContent>
                      {depth0Options.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      <SelectItem value="__new__">+ 직접 입력</SelectItem>
                    </SelectContent>
                  </Select>
                ) : null}
                {(depth0Options.length === 0 || depth0 === '') && (
                  <Input
                    value={depth0}
                    onChange={e => setDepth0(e.target.value)}
                    placeholder="0Depth 입력"
                    className="h-8 text-sm"
                  />
                )}
              </div>

              {/* 1Depth */}
              {depth0 && (
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-gray-400 w-14 shrink-0">1Depth</span>
                  {depth1Options.length > 0 ? (
                    <Select value={depth1} onValueChange={v => setDepth1(v === '__new__' ? '' : v)}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="선택 또는 직접 입력" />
                      </SelectTrigger>
                      <SelectContent>
                        {depth1Options.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                        <SelectItem value="__new__">+ 직접 입력</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : null}
                  {(depth1Options.length === 0 || depth1 === '') && (
                    <Input
                      value={depth1}
                      onChange={e => setDepth1(e.target.value)}
                      placeholder="1Depth 입력"
                      className="h-8 text-sm"
                    />
                  )}
                </div>
              )}

              {/* 2Depth */}
              {depth1 && (
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-gray-400 w-14 shrink-0">2Depth</span>
                  <Input
                    value={depth2}
                    onChange={e => setDepth2(e.target.value)}
                    placeholder="2Depth 입력"
                    className="h-8 text-sm"
                  />
                </div>
              )}

              {/* 3Depth */}
              {depth2 && (
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-gray-400 w-14 shrink-0">3Depth</span>
                  <Input
                    value={depth3}
                    onChange={e => setDepth3(e.target.value)}
                    placeholder="3Depth 입력"
                    className="h-8 text-sm"
                  />
                </div>
              )}
            </div>
          </div>

          {/* 기능명 */}
          <div>
            <label className="text-sm font-medium mb-1 block">기능/요구사항명</label>
            <Input
              value={featureName}
              onChange={e => setFeatureName(e.target.value)}
              placeholder="기능명 입력"
              className="text-sm"
            />
          </div>

          {/* 상세 */}
          <div>
            <label className="text-sm font-medium mb-1 block">상세</label>
            <Textarea
              value={originalSpec}
              onChange={e => setOriginalSpec(e.target.value)}
              placeholder="요구사항 상세 내용 입력"
              className="text-sm h-24"
            />
          </div>

          {/* 우선순위 */}
          <div>
            <label className="text-sm font-medium mb-1 block">우선순위</label>
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map(({ value, label }) => {
                const activeStyle: Record<Priority, string> = {
                  높음: 'bg-red-500 text-white border-red-500',
                  중간: 'bg-yellow-500 text-white border-yellow-500',
                  낮음: 'bg-blue-500 text-white border-blue-500',
                }
                const idleStyle: Record<Priority, string> = {
                  높음: 'text-red-600 border-red-200 hover:bg-red-50',
                  중간: 'text-yellow-600 border-yellow-200 hover:bg-yellow-50',
                  낮음: 'text-blue-600 border-blue-200 hover:bg-blue-50',
                }
                const isActive = priority === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPriority(isActive ? '' : value)}
                    className={`px-3 py-1 rounded text-sm font-medium border transition-colors ${
                      isActive ? activeStyle[value] : idleStyle[value]
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" onClick={handleClose}>취소</Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? '저장 중...' : '추가'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
