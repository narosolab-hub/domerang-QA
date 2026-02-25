'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { StatusBadge } from './StatusBadge'
import { getRequirementsWithResults, deleteRequirements, getDepthValues } from '@/lib/queries'
import type { Requirement, TestResult, System, TestStatus, Priority } from '@/lib/types'
import { getSystemColor } from '@/lib/types'
import { Trash2, Search, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'

interface Props {
  cycleId: string
  systems: System[]
  onSelectRequirement: (req: Requirement & { currentResult?: TestResult }) => void
  selectedId: string | null
  refreshKey: number
  onRefresh: () => void
}

type SortField = 'display_id' | 'feature_name' | 'priority' | 'status'

const STATUS_OPTIONS = ['all', 'Pass', 'Fail', 'Block', 'In Progress', '미테스트'] as const
const STATUS_LABELS: Record<string, string> = {
  all: '전체 상태',
  Pass: 'Pass',
  Fail: 'Fail',
  Block: 'Block',
  'In Progress': '진행중',
  '미테스트': '미테스트',
}

const PRIORITY_SORT: Record<string, number> = { '높음': 0, '중간': 1, '낮음': 2 }
const STATUS_SORT: Record<string, number>   = { 'Pass': 0, 'In Progress': 1, 'Block': 2, 'Fail': 3, '미테스트': 4 }

export function RequirementsTab({ cycleId, systems, onSelectRequirement, selectedId, refreshKey, onRefresh }: Props) {
  const [requirements, setRequirements] = useState<(Requirement & { currentResult?: TestResult })[]>([])
  const [loading, setLoading] = useState(true)

  // 서버 필터 상태
  const [systemFilters, setSystemFilters] = useState<Set<string>>(new Set())
  const [depth0Filters, setDepth0Filters] = useState<Set<string>>(new Set())
  const [depth1Filters, setDepth1Filters] = useState<Set<string>>(new Set())
  const [depth2Filters, setDepth2Filters] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState('all')
  const [scenarioFilter, setScenarioFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')

  function toggleSystem(id: string) {
    setSystemFilters(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    setDepth0Filters(new Set())
    setDepth1Filters(new Set())
    setDepth2Filters(new Set())
  }

  function toggleDepth0(d: string) {
    setDepth0Filters(prev => {
      const next = new Set(prev)
      if (next.has(d)) {
        next.delete(d)
        const validDepth1 = new Set(Array.from(next).flatMap(p => depth1ByParent[p] ?? []))
        setDepth1Filters(p1 => new Set(Array.from(p1).filter(v => validDepth1.has(v))))
        setDepth2Filters(new Set())
      } else {
        next.add(d)
      }
      return next
    })
  }

  function toggleDepth1(d: string) {
    setDepth1Filters(prev => {
      const next = new Set(prev)
      if (next.has(d)) {
        next.delete(d)
        const validDepth2 = new Set(Array.from(next).flatMap(p => depth2ByParent[p] ?? []))
        setDepth2Filters(p2 => new Set(Array.from(p2).filter(v => validDepth2.has(v))))
      } else {
        next.add(d)
      }
      return next
    })
  }

  function toggleDepth2(d: string) {
    setDepth2Filters(prev => {
      const next = new Set(prev)
      next.has(d) ? next.delete(d) : next.add(d)
      return next
    })
  }
  const [search, setSearch] = useState('')

  // 클라이언트 정렬 / ID 범위 필터
  const [sortBy,  setSortBy]  = useState<SortField>('display_id')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [idFrom,  setIdFrom]  = useState('')
  const [idTo,    setIdTo]    = useState('')

  // Depth 옵션
  const [depth0Options, setDepth0Options] = useState<string[]>([])
  const [depth1ByParent, setDepth1ByParent] = useState<Record<string, string[]>>({})
  const [depth2ByParent, setDepth2ByParent] = useState<Record<string, string[]>>({})

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // depth 옵션 리로드 (시스템 필터 변경 시)
  const systemFilterKey = [...systemFilters].sort().join(',')
  useEffect(() => {
    getDepthValues(systemFilters.size > 0 ? Array.from(systemFilters) : undefined).then(({ depth_0, depth_1ByParent, depth_2ByParent }) => {
      setDepth0Options(depth_0)
      setDepth1ByParent(depth_1ByParent)
      setDepth2ByParent(depth_2ByParent)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemFilterKey, refreshKey])

  // 요구사항 목록 로드
  const depth0FilterKey = [...depth0Filters].sort().join(',')
  const depth1FilterKey = [...depth1Filters].sort().join(',')
  const depth2FilterKey = [...depth2Filters].sort().join(',')
  useEffect(() => {
    if (!cycleId) return
    setLoading(true)
    getRequirementsWithResults(cycleId, {
      systemIds: systemFilters.size > 0 ? Array.from(systemFilters) : undefined,
      depth0: depth0Filters.size > 0 ? Array.from(depth0Filters) : undefined,
      depth1: depth1Filters.size > 0 ? Array.from(depth1Filters) : undefined,
      depth2: depth2Filters.size > 0 ? Array.from(depth2Filters) : undefined,
      search: search || undefined,
      statusFilter: statusFilter !== 'all' ? statusFilter : undefined,
      scenarioFilter: scenarioFilter !== 'all' ? scenarioFilter : undefined,
      priorityFilter: priorityFilter !== 'all' ? priorityFilter : undefined,
    }).then(data => {
      setRequirements(data)
    }).finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId, systemFilterKey, depth0FilterKey, depth1FilterKey, depth2FilterKey, statusFilter, scenarioFilter, priorityFilter, search, refreshKey])

  const handleDelete = async () => {
    if (selected.size === 0) return
    if (!confirm(`${selected.size}개 요구사항을 삭제하시겠습니까?`)) return
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteRequirements(Array.from(selected))
      setSelected(new Set())
      onRefresh()
    } catch (e) {
      setDeleteError('삭제 실패: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setDeleting(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── 정렬 ────────────────────────────────────────────────────────────────────
  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortDir('asc')
    }
  }

  // ID 범위 필터 + 정렬 적용
  const displayed = [...requirements]
    .filter(r => {
      if (!idFrom && !idTo) return true
      const id = r.display_id
      if (id === null) return false
      if (idFrom && id < parseInt(idFrom)) return false
      if (idTo   && id > parseInt(idTo))   return false
      return true
    })
    .sort((a, b) => {
      let cmp = 0
      switch (sortBy) {
        case 'display_id':
          cmp = (a.display_id ?? 0) - (b.display_id ?? 0)
          break
        case 'feature_name':
          cmp = (a.feature_name ?? '').localeCompare(b.feature_name ?? '', 'ko')
          break
        case 'priority':
          cmp = (PRIORITY_SORT[a.priority ?? ''] ?? 3) - (PRIORITY_SORT[b.priority ?? ''] ?? 3)
          break
        case 'status': {
          const sa = a.currentResult?.status ?? '미테스트'
          const sb = b.currentResult?.status ?? '미테스트'
          cmp = (STATUS_SORT[sa] ?? 4) - (STATUS_SORT[sb] ?? 4)
          break
        }
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

  const toggleAll = () => {
    if (selected.size === displayed.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(displayed.map(r => r.id)))
    }
  }

  const depth1Options = [...new Set(Array.from(depth0Filters).flatMap(d => depth1ByParent[d] ?? []))]
  const depth2Options = [...new Set(Array.from(depth1Filters).flatMap(d => depth2ByParent[d] ?? []))]
  const hasDepthFilter = depth0Filters.size > 0 || depth1Filters.size > 0 || depth2Filters.size > 0
  const hasIdFilter = !!idFrom || !!idTo

  // 컬럼 헤더 정렬 아이콘
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) return <ArrowUpDown className="h-3 w-3 opacity-30 shrink-0" />
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 shrink-0" />
      : <ArrowDown className="h-3 w-3 shrink-0" />
  }

  return (
    <div className="space-y-3">
      {/* 1행: 시스템 버튼 (다중 선택) */}
      <div className="flex gap-1.5 flex-wrap items-center">
        {systems.map(s => {
          const c = getSystemColor(s.name)
          const active = systemFilters.has(s.id)
          return (
            <button
              key={s.id}
              onClick={() => toggleSystem(s.id)}
              className={`px-3 py-1.5 rounded text-sm font-medium border transition-colors ${
                active ? c.buttonActive : c.buttonBase
              }`}
            >
              {s.name}
            </button>
          )
        })}
        {systemFilters.size > 0 && (
          <button
            onClick={() => { setSystemFilters(new Set()); setDepth0Filters(new Set()); setDepth1Filters(new Set()); setDepth2Filters(new Set()) }}
            className="text-xs text-gray-400 hover:text-gray-700 underline ml-1"
          >
            초기화
          </button>
        )}
      </div>

      {/* 2행: 상태/시나리오/우선순위 드롭다운 + ID 범위 + 검색 */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(s => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={scenarioFilter} onValueChange={setScenarioFilter}>
          <SelectTrigger className="w-32 h-8 text-sm">
            <SelectValue placeholder="시나리오" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="has">시나리오 있음</SelectItem>
            <SelectItem value="none">시나리오 없음</SelectItem>
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-28 h-8 text-sm">
            <SelectValue placeholder="우선순위" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 우선순위</SelectItem>
            <SelectItem value="높음">🔴 높음</SelectItem>
            <SelectItem value="중간">🟡 중간</SelectItem>
            <SelectItem value="낮음">🔵 낮음</SelectItem>
            <SelectItem value="none">미설정</SelectItem>
          </SelectContent>
        </Select>

        {/* ID 범위 필터 */}
        <div className="flex items-center gap-1 border border-gray-200 rounded-md px-2 h-8 bg-white">
          <span className="text-xs text-gray-400 font-mono">#</span>
          <input
            type="text"
            inputMode="numeric"
            value={idFrom}
            onChange={e => setIdFrom(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="from"
            className="w-9 text-xs text-center outline-none placeholder:text-gray-300 bg-transparent"
          />
          <span className="text-xs text-gray-300">~</span>
          <input
            type="text"
            inputMode="numeric"
            value={idTo}
            onChange={e => setIdTo(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="to"
            className="w-9 text-xs text-center outline-none placeholder:text-gray-300 bg-transparent"
          />
          {hasIdFilter && (
            <button
              onClick={() => { setIdFrom(''); setIdTo('') }}
              className="text-gray-400 hover:text-gray-700 text-xs leading-none ml-0.5"
              title="ID 필터 초기화"
            >×</button>
          )}
        </div>

        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="기능명, 상세 검색..."
            className="pl-7 h-8 text-sm"
          />
        </div>

        {selected.size > 0 && (
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            {selected.size}개 삭제
          </Button>
        )}
      </div>

      {/* 3행: Depth 계층 필터 */}
      {depth0Options.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 shrink-0">경로 필터</span>

          <div className="flex flex-wrap gap-1">
            {depth0Options.map(d => (
              <button
                key={d}
                onClick={() => toggleDepth0(d)}
                className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${
                  depth0Filters.has(d)
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          {depth0Filters.size > 0 && depth1Options.length > 0 && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <div className="flex flex-wrap gap-1">
                {depth1Options.map(d => (
                  <button
                    key={d}
                    onClick={() => toggleDepth1(d)}
                    className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${
                      depth1Filters.has(d)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </>
          )}

          {depth1Filters.size > 0 && depth2Options.length > 0 && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <div className="flex flex-wrap gap-1">
                {depth2Options.map(d => (
                  <button
                    key={d}
                    onClick={() => toggleDepth2(d)}
                    className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${
                      depth2Filters.has(d)
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-violet-400'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </>
          )}

          {hasDepthFilter && (
            <button
              onClick={() => { setDepth0Filters(new Set()); setDepth1Filters(new Set()); setDepth2Filters(new Set()) }}
              className="text-xs text-gray-400 hover:text-gray-700 underline ml-1"
            >
              초기화
            </button>
          )}
        </div>
      )}

      {/* 결과 수 */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span>
          총 <strong className="text-gray-700">{displayed.length}</strong>개 항목
          {displayed.length !== requirements.length && (
            <span className="text-gray-400 ml-1">(전체 {requirements.length}개)</span>
          )}
        </span>
        {hasDepthFilter && (
          <span className="text-blue-600">
            · {[...depth0Filters].join(', ')}
            {depth1Filters.size > 0 ? ` › ${[...depth1Filters].join(', ')}` : ''}
            {depth2Filters.size > 0 ? ` › ${[...depth2Filters].join(', ')}` : ''}
          </span>
        )}
        {hasIdFilter && (
          <span className="text-indigo-600">
            · #{idFrom || '?'} ~ #{idTo || '?'}
          </span>
        )}
      </div>

      {deleteError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {deleteError}
        </div>
      )}

      {/* 테이블 */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">로딩 중...</div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          {requirements.length === 0 ? (
            <>
              요구사항이 없습니다.<br />
              <span className="text-sm">필터를 조정하거나 업로드 버튼으로 추가하세요.</span>
            </>
          ) : (
            <>
              해당 조건의 요구사항이 없습니다.<br />
              <span className="text-sm">ID 범위 또는 다른 필터를 조정해보세요.</span>
            </>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="w-8 px-3 py-2 text-left">
                  <Checkbox
                    checked={selected.size === displayed.length && displayed.length > 0}
                    onCheckedChange={toggleAll}
                  />
                </th>
                {/* # 정렬 컬럼 */}
                <th
                  className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-14 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('display_id')}
                >
                  <span className="flex items-center gap-0.5 whitespace-nowrap">
                    # <SortIcon field="display_id" />
                  </span>
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-20 whitespace-nowrap">시스템</th>
                {/* 기능명 정렬 */}
                <th
                  className="px-3 py-2 text-left text-xs font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('feature_name')}
                >
                  <span className="flex items-center gap-0.5 whitespace-nowrap">
                    경로 / 기능명 <SortIcon field="feature_name" />
                  </span>
                </th>
                {/* 우선순위 정렬 */}
                <th
                  className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[100px] cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('priority')}
                >
                  <span className="flex items-center gap-0.5 whitespace-nowrap">
                    우선순위 <SortIcon field="priority" />
                  </span>
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[88px] whitespace-nowrap">시나리오</th>
                {/* 상태 정렬 */}
                <th
                  className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-24 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('status')}
                >
                  <span className="flex items-center gap-0.5 whitespace-nowrap">
                    상태 <SortIcon field="status" />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayed.map(req => {
                const status: TestStatus = req.currentResult?.status ?? '미테스트'
                const depthPath = [req.depth_0, req.depth_1, req.depth_2, req.depth_3]
                  .filter(Boolean)
                  .join(' › ')
                const hasScenario = !!(req.precondition || req.test_steps || req.expected_result)
                const priorityStyle: Record<Priority, string> = {
                  높음: 'bg-red-100 text-red-700 border-red-200',
                  중간: 'bg-yellow-100 text-yellow-700 border-yellow-200',
                  낮음: 'bg-blue-100 text-blue-700 border-blue-200',
                }

                return (
                  <tr
                    key={req.id}
                    className={`hover:bg-gray-50 cursor-pointer transition-colors ${
                      selectedId === req.id ? 'bg-blue-50 hover:bg-blue-50' : ''
                    }`}
                    onClick={() => onSelectRequirement(req)}
                  >
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(req.id)}
                        onCheckedChange={() => toggleSelect(req.id)}
                      />
                    </td>
                    {/* # 셀 */}
                    <td className="px-3 py-2.5">
                      <span className="text-xs font-mono text-gray-400">
                        {req.display_id != null ? `#${req.display_id}` : '-'}
                      </span>
                    </td>
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
                        {req.feature_name ?? '(기능명 없음)'}
                      </p>
                      {req.original_spec && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {req.original_spec}
                        </p>
                      )}
                      {req.current_policy && (
                        <Badge variant="outline" className="text-xs mt-0.5 border-orange-300 text-orange-600">
                          정책변경
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {req.priority ? (
                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${priorityStyle[req.priority as Priority]}`}>
                          {req.priority}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {hasScenario ? (
                        <Badge variant="secondary" className="text-xs bg-green-50 text-green-700 border-green-200">
                          작성됨
                        </Badge>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={status} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
