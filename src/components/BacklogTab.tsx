'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from './StatusBadge'
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

// ── 이슈 처리 현황판 ────────────────────────────────────────────

type IssueView = 'all' | 'not_raised' | 'raised' | 'fixed'
const ISSUE_VIEW_LABELS: Record<IssueView, string> = {
  all: '전체',
  not_raised: '미이슈라이징',
  raised: '이슈라이징 완료',
  fixed: '수정완료',
}

function IssueBoard({
  items,
  onSelect,
}: {
  items: ReqWithResult[]
  onSelect: (req: ReqWithResult) => void
}) {
  const [view, setView] = useState<IssueView>('all')

  const total = items.length
  const raised = items.filter(i => i.currentResult?.issue_raised).length
  const fixed = items.filter(i => i.currentResult?.issue_fixed).length
  const needRetest = items.filter(i => i.currentResult?.retest_reason).length

  const filtered = items.filter(item => {
    const r = item.currentResult
    if (view === 'not_raised') return !r?.issue_raised
    if (view === 'raised') return r?.issue_raised && !r?.issue_fixed
    if (view === 'fixed') return !!r?.issue_fixed
    return true
  })

  return (
    <section>
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          🔥 이슈 처리 현황
          <Badge variant="secondary">{total}</Badge>
        </h2>
        <div className="flex gap-3 text-xs text-gray-500">
          <span>
            이슈라이징{' '}
            <strong className="text-gray-800">
              {raised}/{total}
            </strong>
          </span>
          <span>
            수정완료{' '}
            <strong className="text-gray-800">
              {fixed}/{total}
            </strong>
          </span>
          {needRetest > 0 && (
            <span>
              재테스트 필요{' '}
              <strong className="text-orange-600">{needRetest}</strong>
            </span>
          )}
        </div>
      </div>

      {/* 필터 칩 */}
      <div className="flex gap-1 flex-wrap mb-3">
        {(['all', 'not_raised', 'raised', 'fixed'] as IssueView[]).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
              view === v
                ? 'bg-gray-800 text-white border-gray-800'
                : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
            }`}
          >
            {ISSUE_VIEW_LABELS[v]}
          </button>
        ))}
      </div>

      {/* 테이블 */}
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">해당하는 항목이 없습니다.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[9%]"><span className="whitespace-nowrap">시스템</span></th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[38%]">기능명</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[10%]"><span className="whitespace-nowrap">상태</span></th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[9%]"><span className="whitespace-nowrap">이슈 현황</span></th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 w-[11%]"><span className="whitespace-nowrap">이슈라이징</span></th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 w-[10%]"><span className="whitespace-nowrap">수정완료</span></th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[11%]"><span className="whitespace-nowrap">재테스트</span></th>
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
                      <StatusBadge status={r?.status ?? '미테스트'} />
                    </td>
                    <td className="px-3 py-2.5">
                      {r?.issue_items && r.issue_items.length > 0 ? (
                        <span className={`text-xs font-medium whitespace-nowrap ${
                          r.issue_items.every(i => i.fixed) ? 'text-green-600' : 'text-blue-600'
                        }`}>
                          {r.issue_items.filter(i => i.fixed).length}/{r.issue_items.length}건
                        </span>
                      ) : r?.issue_ids ? (
                        <span className="text-xs text-blue-600 truncate block">{r.issue_ids}</span>
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
                    <td className="px-3 py-2.5 text-center">
                      {r?.issue_fixed ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 inline" />
                      ) : (
                        <Circle className="h-4 w-4 text-gray-300 inline" />
                      )}
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

  // 이슈 처리 현황판: Fail / Block 항목
  const issueItems = allItems.filter(
    r => r.currentResult?.status === 'Fail' || r.currentResult?.status === 'Block'
  )

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
      <IssueBoard items={issueItems} onSelect={onSelectRequirement} />
      <TestQueue items={queueItems} onSelect={onSelectRequirement} />
    </div>
  )
}
