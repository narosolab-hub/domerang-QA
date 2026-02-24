'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { getRequirementsWithResults } from '@/lib/queries'
import type { Requirement, TestResult, System } from '@/lib/types'
import { getSystemColor } from '@/lib/types'
import { CheckCircle2, Circle } from 'lucide-react'

interface Props {
  cycleId: string
  systems: System[]
  onSelectRequirement: (req: Requirement & { currentResult?: TestResult }) => void
  refreshKey: number
}

type ReqWithResult = Requirement & { currentResult?: TestResult }

const PRIORITY_ORDER: Record<string, number> = { 높음: 0, 중간: 1, 낮음: 2 }

// ── Block 현황판 ─────────────────────────────────────────────────

function BlockBoard({
  items,
  systems,
  onSelect,
}: {
  items: ReqWithResult[]
  systems: System[]
  onSelect: (req: ReqWithResult) => void
}) {
  const [sysFilters, setSysFilters] = useState<Set<string>>(new Set())

  if (items.length === 0) return null

  const activeSystems = systems.filter(s => items.some(i => (i.systems as any)?.id === s.id))
  const filtered = sysFilters.size === 0
    ? items
    : items.filter(i => sysFilters.has((i.systems as any)?.id))

  function toggleSys(id: string) {
    setSysFilters(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          🚫 Block 현황
          <Badge variant="secondary">{items.length}</Badge>
        </h2>
        {activeSystems.length > 1 && (
          <div className="flex gap-1 ml-auto">
            {activeSystems.map(s => {
              const c = getSystemColor(s.name)
              return (
                <button
                  key={s.id}
                  onClick={() => toggleSys(s.id)}
                  className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                    sysFilters.has(s.id) ? c.buttonActive : c.buttonBase
                  }`}
                >
                  {s.name}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-y-auto max-h-[220px]">
          <table className="w-full text-sm table-fixed">
            <thead className="bg-gray-50 border-b sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[10%]"><span className="whitespace-nowrap">시스템</span></th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[55%]">기능명</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[20%]"><span className="whitespace-nowrap">재테스트</span></th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[15%]"><span className="whitespace-nowrap">이슈라이징</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(req => {
                const r = req.currentResult
                const depthPath = [req.depth_0, req.depth_1].filter(Boolean).join(' › ')
                return (
                  <tr
                    key={req.id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => onSelect(req)}
                  >
                    <td className="px-3 py-2.5">
                      {(() => {
                        const sysName = (req.systems as any)?.name
                        return (
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getSystemColor(sysName).badge}`}>
                            {sysName ?? '-'}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="px-3 py-2.5">
                      {depthPath && (
                        <p className="text-xs text-gray-400 mb-0.5 truncate">{depthPath}</p>
                      )}
                      <p className="font-medium truncate">
                        {req.display_id && (
                          <span className="text-xs font-mono text-gray-400 mr-1">#{req.display_id}</span>
                        )}
                        {req.feature_name ?? '(기능명 없음)'}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      {r?.retest_reason ? (
                        <span className="px-2 py-0.5 rounded text-xs bg-orange-50 text-orange-600 border border-orange-200 whitespace-nowrap">
                          {r.retest_reason}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {r?.issue_raised ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 inline" />
                      ) : (
                        <Circle className="h-4 w-4 text-gray-300 inline" />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

// ── 테스트 작업 큐 ───────────────────────────────────────────────

const PRIORITY_STYLE: Record<string, string> = {
  높음: 'bg-red-100 text-red-700 border-red-200',
  중간: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  낮음: 'bg-blue-100 text-blue-700 border-blue-200',
}

function TestQueue({
  items,
  onSelect,
}: {
  items: ReqWithResult[]
  onSelect: (req: ReqWithResult) => void
}) {
  const untest = items.filter(r => !r.currentResult?.retest_reason)
  const retest = items.filter(r => r.currentResult?.retest_reason)

  return (
    <section>
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <h2 className="font-semibold text-gray-800">📋 테스트 작업 큐</h2>
        <Badge variant="secondary">{items.length}</Badge>
        <span className="text-xs text-gray-400">
          미테스트 {untest.length} · 재테스트 필요 {retest.length}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">
          모든 항목이 테스트되었습니다. 🎉
        </p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[9%]"><span className="whitespace-nowrap">시스템</span></th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[55%]">기능명 / 경로</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[11%]"><span className="whitespace-nowrap">우선순위</span></th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[25%]"><span className="whitespace-nowrap">구분</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map(req => {
                const r = req.currentResult
                const depthPath = [req.depth_0, req.depth_1].filter(Boolean).join(' › ')
                const isRetest = !!r?.retest_reason
                return (
                  <tr
                    key={req.id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => onSelect(req)}
                  >
                    <td className="px-3 py-2.5">
                      {(() => {
                        const sysName = (req.systems as any)?.name
                        return (
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getSystemColor(sysName).badge}`}>
                            {sysName ?? '-'}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="px-3 py-2.5">
                      {depthPath && (
                        <p className="text-xs text-gray-400 mb-0.5 truncate">{depthPath}</p>
                      )}
                      <p className="font-medium truncate">
                        {req.display_id && (
                          <span className="text-xs font-mono text-gray-400 mr-1">#{req.display_id}</span>
                        )}
                        {req.feature_name ?? '(기능명 없음)'}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      {req.priority ? (
                        <span className={`px-2 py-0.5 rounded text-xs font-medium border whitespace-nowrap ${PRIORITY_STYLE[req.priority] ?? ''}`}>
                          {req.priority}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {isRetest ? (
                        <span className="px-2 py-0.5 rounded text-xs bg-orange-50 text-orange-600 border border-orange-200 whitespace-nowrap">
                          재테스트 · {r!.retest_reason}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600 whitespace-nowrap">
                          미테스트
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────

export function BacklogTab({ cycleId, systems, onSelectRequirement, refreshKey }: Props) {
  const [allItems, setAllItems] = useState<ReqWithResult[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!cycleId) return
    setLoading(true)
    getRequirementsWithResults(cycleId)
      .then(data => setAllItems(data))
      .finally(() => setLoading(false))
  }, [cycleId, refreshKey])

  if (!cycleId) {
    return (
      <div className="text-center py-20 text-gray-400">
        상단에서 테스트 사이클을 선택하세요
      </div>
    )
  }

  if (loading) {
    return <div className="text-center py-20 text-gray-400">로딩 중...</div>
  }

  // Block 현황: Block 상태 항목만
  const blockItems = allItems.filter(r => r.currentResult?.status === 'Block')

  // 테스트 작업 큐: 미테스트 + 재테스트 필요 (우선순위 정렬)
  const queueItems = allItems
    .filter(r => {
      const status = r.currentResult?.status
      const isUntest = !status || status === '미테스트'
      const isRetest = !!r.currentResult?.retest_reason && status !== '미테스트'
      return isUntest || isRetest
    })
    .sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority ?? ''] ?? 3
      const pb = PRIORITY_ORDER[b.priority ?? ''] ?? 3
      if (pa !== pb) return pa - pb
      // 우선순위 같으면 재테스트 항목 먼저
      const ra = a.currentResult?.retest_reason ? 0 : 1
      const rb = b.currentResult?.retest_reason ? 0 : 1
      return ra - rb
    })

  return (
    <div className="space-y-8">
      <BlockBoard items={blockItems} systems={systems} onSelect={onSelectRequirement} />
      <TestQueue items={queueItems} onSelect={onSelectRequirement} />
    </div>
  )
}
