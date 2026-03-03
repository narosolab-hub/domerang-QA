'use client'

import { useEffect, useState, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from './StatusBadge'
import { getRequirementsWithResults, getScenariosWithIssues } from '@/lib/queries'
import type { ScenarioWithIssue } from '@/lib/queries'
import type { Requirement, TestResult, System, IssueItem, Severity } from '@/lib/types'
import { getSystemColor, SEVERITY_STYLE, SEVERITY_ORDER } from '@/lib/types'

interface Props {
  cycleId: string
  systems: System[]
  onSelectRequirement: (req: Requirement & { currentResult?: TestResult }) => void
  onSelectScenario?: () => void
  refreshKey: number
}

type ReqWithResult = Requirement & { currentResult?: TestResult }
type StatusFilter = 'not_raised' | 'raised' | 'fixed'
type SevFilter = Severity | '미설정'
type ViewMode = 'by_item' | 'by_source'
type SourceFilter = 'all' | 'requirement' | 'scenario'

interface IssueRow {
  sourceType: 'requirement' | 'scenario'
  req?: ReqWithResult
  scenario?: ScenarioWithIssue
  itemIdx: number
  item: IssueItem
}

interface IssueGroup {
  sourceType: 'requirement' | 'scenario'
  req?: ReqWithResult
  scenario?: ScenarioWithIssue
}

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  not_raised: '미라이징',
  raised:     '라이징 완료',
  fixed:      '수정완료',
}


export function IssueTab({ cycleId, systems, onSelectRequirement, onSelectScenario, refreshKey }: Props) {
  const [allReqs, setAllReqs]               = useState<ReqWithResult[]>([])
  const [allScenarios, setAllScenarios]     = useState<ScenarioWithIssue[]>([])
  const [loading, setLoading]               = useState(true)
  const [viewMode, setViewMode]             = useState<ViewMode>('by_item')
  const [activeStatuses, setActiveStatuses] = useState<Set<StatusFilter>>(new Set())
  const [activeSeverities, setActiveSeverities] = useState<Set<SevFilter>>(new Set())
  const [sysFilters, setSysFilters]         = useState<Set<string>>(new Set())
  const [sourceFilter, setSourceFilter]     = useState<SourceFilter>('all')

  function toggleSys(id: string) {
    setSysFilters(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleStatus(f: StatusFilter) {
    setActiveStatuses(prev => {
      const next = new Set(prev)
      next.has(f) ? next.delete(f) : next.add(f)
      return next
    })
  }

  function toggleSeverity(s: SevFilter) {
    setActiveSeverities(prev => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      return next
    })
  }

  useEffect(() => {
    if (!cycleId) return
    setLoading(true)
    Promise.all([
      getRequirementsWithResults(cycleId),
      getScenariosWithIssues(cycleId),
    ])
      .then(([reqs, scenarios]) => {
        setAllReqs(reqs)
        setAllScenarios(scenarios)
      })
      .finally(() => setLoading(false))
  }, [cycleId, refreshKey])

  const issueReqs = useMemo(
    () => allReqs.filter(r => {
      const status = r.currentResult?.status
      const hasItems = (r.currentResult?.issue_items?.length ?? 0) > 0
      return (status === 'Fail' || hasItems) && status !== 'Block'
    }),
    [allReqs]
  )

  const reqIssueRows = useMemo((): IssueRow[] =>
    issueReqs.flatMap(req =>
      (req.currentResult?.issue_items ?? [])
        .map((item, idx) => ({ sourceType: 'requirement' as const, req, itemIdx: idx, item }))
        .filter(r => r.item.text)
    ),
    [issueReqs]
  )

  const scenarioIssueRows = useMemo((): IssueRow[] =>
    allScenarios.flatMap(scenario =>
      (scenario.result?.issue_items ?? [])
        .map((item, idx) => ({ sourceType: 'scenario' as const, scenario, itemIdx: idx, item }))
        .filter(r => r.item.text)
    ),
    [allScenarios]
  )

  const allIssueRows = useMemo((): IssueRow[] =>
    [...reqIssueRows, ...scenarioIssueRows],
    [reqIssueRows, scenarioIssueRows]
  )

  const stats = useMemo(() => ({
    total:     allIssueRows.length,
    reqTotal:  reqIssueRows.length,
    scnTotal:  scenarioIssueRows.length,
    notRaised: allIssueRows.filter(r => !r.item.raised).length,
    raised:    allIssueRows.filter(r => r.item.raised && !r.item.fixed).length,
    fixed:     allIssueRows.filter(r => r.item.fixed).length,
    critical:  allIssueRows.filter(r => r.item.severity === '크리티컬').length,
    high:      allIssueRows.filter(r => r.item.severity === '하이').length,
  }), [allIssueRows, reqIssueRows, scenarioIssueRows])

  const activeSystems = systems.filter(s =>
    issueReqs.some(r => (r.systems as any)?.id === s.id) ||
    allScenarios.some(sc => sc.system_ids?.includes(s.id))
  )

  function getScenarioSystemName(scenario: ScenarioWithIssue): string {
    if (!scenario.system_ids?.length) return '-'
    return systems.find(s => scenario.system_ids.includes(s.id))?.name ?? '-'
  }

  function rowMatchesSysFilter(row: IssueRow): boolean {
    if (sysFilters.size === 0) return true
    if (row.sourceType === 'requirement') return sysFilters.has(row.req!.system_id)
    return row.scenario!.system_ids?.some(id => sysFilters.has(id)) ?? false
  }

  const filteredRows = allIssueRows
    .filter(rowMatchesSysFilter)
    .filter(r => sourceFilter === 'all' || r.sourceType === (sourceFilter === 'requirement' ? 'requirement' : 'scenario'))
    .filter(r => {
      if (activeStatuses.size === 0) return true
      return (
        (activeStatuses.has('not_raised') && !r.item.raised) ||
        (activeStatuses.has('raised')     && r.item.raised && !r.item.fixed) ||
        (activeStatuses.has('fixed')      && r.item.fixed)
      )
    })
    .filter(r => {
      if (activeSeverities.size === 0) return true
      return (
        (activeSeverities.has('미설정') && !r.item.severity) ||
        (r.item.severity != null && activeSeverities.has(r.item.severity))
      )
    })
    .sort((a, b) => {
      const sa = a.item.severity ? SEVERITY_ORDER[a.item.severity] : 4
      const sb = b.item.severity ? SEVERITY_ORDER[b.item.severity] : 4
      return sa - sb
    })

  const issueGroups = useMemo((): IssueGroup[] => {
    const reqGroups: IssueGroup[] = issueReqs
      .filter(r => sysFilters.size === 0 || sysFilters.has(r.system_id))
      .filter(() => sourceFilter === 'all' || sourceFilter === 'requirement')
      .map(r => ({ sourceType: 'requirement' as const, req: r }))

    const scenarioGroups: IssueGroup[] = allScenarios
      .filter(sc => sysFilters.size === 0 || sc.system_ids?.some(id => sysFilters.has(id)))
      .filter(() => sourceFilter === 'all' || sourceFilter === 'scenario')
      .map(sc => ({ sourceType: 'scenario' as const, scenario: sc }))

    return [...reqGroups, ...scenarioGroups]
  }, [issueReqs, allScenarios, sysFilters, sourceFilter])

  const filteredGroups = issueGroups.filter(g => {
    if (activeStatuses.size === 0) return true
    if (g.sourceType === 'requirement') {
      const res = g.req!.currentResult
      return (
        (activeStatuses.has('not_raised') && !res?.issue_raised) ||
        (activeStatuses.has('raised')     && !!res?.issue_raised && !res?.issue_fixed) ||
        (activeStatuses.has('fixed')      && !!res?.issue_fixed)
      )
    } else {
      const items = g.scenario!.result?.issue_items ?? []
      const allRaised = items.length > 0 && items.every(i => i.raised)
      const allFixed  = items.length > 0 && items.every(i => i.fixed)
      return (
        (activeStatuses.has('not_raised') && !allRaised) ||
        (activeStatuses.has('raised')     && allRaised && !allFixed) ||
        (activeStatuses.has('fixed')      && allFixed)
      )
    }
  })

  if (!cycleId) return (
    <div className="text-center py-20 text-gray-400">상단에서 테스트 사이클을 선택하세요</div>
  )
  if (loading) return (
    <div className="text-center py-20 text-gray-400">로딩 중...</div>
  )

  return (
    <div className="space-y-3">

      {/* ── 헤더 ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-semibold text-gray-800 flex items-center gap-1.5">
            🔥 이슈 목록
            <Badge variant="secondary">{stats.total}</Badge>
          </h2>
          {stats.notRaised > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-orange-100 text-orange-700 border border-orange-200">
              미라이징 {stats.notRaised}
            </span>
          )}
          {stats.critical > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-100 text-red-700 border border-red-200">
              크리티컬 {stats.critical}
            </span>
          )}
          {stats.high > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-orange-100 text-orange-600 border border-orange-200">
              하이 {stats.high}
            </span>
          )}
          {stats.fixed > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-100 text-green-700 border border-green-200">
              수정완료 {stats.fixed}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* 뷰 모드 토글 */}
          <div className="flex text-xs border border-gray-200 rounded overflow-hidden">
            <button
              onClick={() => setViewMode('by_item')}
              className={`px-3 py-1.5 transition-colors ${
                viewMode === 'by_item' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              이슈별
            </button>
            <button
              onClick={() => setViewMode('by_source')}
              className={`px-3 py-1.5 border-l border-gray-200 transition-colors ${
                viewMode === 'by_source' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              건별
            </button>
          </div>
          {/* 시스템 필터 */}
          {activeSystems.length > 1 && (
            <div className="flex gap-1">
              {activeSystems.map(s => {
                const c = getSystemColor(s.name)
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleSys(s.id)}
                    className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
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
      </div>

      {/* ── 필터 툴바 ────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* 출처 필터 */}
        <div className="flex text-xs border border-gray-200 rounded overflow-hidden">
          {([
            { key: 'all',         label: `전체 ${stats.total}` },
            { key: 'requirement', label: `요구사항 ${stats.reqTotal}` },
            { key: 'scenario',    label: `시나리오 ${stats.scnTotal}` },
          ] as { key: SourceFilter; label: string }[]).map(({ key, label }, i) => (
            <button
              key={key}
              onClick={() => setSourceFilter(key)}
              className={`px-2.5 py-1 transition-colors ${i > 0 ? 'border-l border-gray-200' : ''} ${
                sourceFilter === key ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <span className="text-gray-300 select-none">|</span>

        {/* 상태 필터 */}
        {(['not_raised', 'raised', 'fixed'] as StatusFilter[]).map(f => {
          const count = f === 'not_raised' ? stats.notRaised : f === 'raised' ? stats.raised : stats.fixed
          const active = activeStatuses.has(f)
          return (
            <button
              key={f}
              onClick={() => toggleStatus(f)}
              className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                active
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
              }`}
            >
              {STATUS_FILTER_LABELS[f]} {count}
            </button>
          )
        })}

        <span className="text-gray-300 select-none">|</span>

        {/* 심각도 필터 */}
        {(['크리티컬', '하이', '미디엄', '로우'] as Severity[]).map(sev => (
          <button
            key={sev}
            onClick={() => toggleSeverity(sev)}
            className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
              activeSeverities.has(sev) ? SEVERITY_STYLE[sev].active : SEVERITY_STYLE[sev].badge
            }`}
          >
            {sev}
          </button>
        ))}
        <button
          onClick={() => toggleSeverity('미설정')}
          className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
            activeSeverities.has('미설정')
              ? 'bg-gray-800 text-white border-gray-800'
              : 'bg-white text-gray-400 border-gray-300 hover:border-gray-500'
          }`}
        >
          미설정
        </button>

        {(activeStatuses.size > 0 || activeSeverities.size > 0) && (
          <button
            onClick={() => { setActiveStatuses(new Set()); setActiveSeverities(new Set()) }}
            className="px-2.5 py-1 rounded-full text-xs border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors"
          >
            초기화
          </button>
        )}
      </div>

      {/* ══ 이슈별: 테이블 ═════════════════════════════════════════ */}
      {viewMode === 'by_item' && (
        filteredRows.length === 0 ? (
          <p className="text-sm text-gray-400 py-10 text-center">해당하는 이슈 항목이 없습니다.</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm table-fixed">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[9%]">심각도</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[24%]">기능/시나리오명</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[36%]">이슈 내용</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[11%]">이슈#</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[20%]">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredRows.map((row) => {
                  const { sourceType, req, scenario, itemIdx, item } = row
                  const isReq = sourceType === 'requirement'
                  const depthPath = isReq
                    ? [req!.depth_0, req!.depth_1].filter(Boolean).join(' › ')
                    : null
                  const displayName = isReq
                    ? (req!.feature_name ?? '(기능명 없음)')
                    : scenario!.title
                  const displayId = isReq ? req!.display_id : null

                  return (
                    <tr
                      key={`${sourceType}-${isReq ? req!.id : scenario!.id}-${itemIdx}`}
                      onClick={() => isReq ? onSelectRequirement(req!) : onSelectScenario?.()}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2.5">
                        {item.severity ? (
                          <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium border whitespace-nowrap ${SEVERITY_STYLE[item.severity].badge}`}>
                            {item.severity}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className={`shrink-0 px-1 py-0 rounded text-[10px] font-medium border ${
                            isReq
                              ? 'bg-blue-50 text-blue-600 border-blue-200'
                              : 'bg-purple-50 text-purple-600 border-purple-200'
                          }`}>
                            {isReq ? '요구사항' : '시나리오'}
                          </span>
                          {depthPath && (
                            <span className="text-[11px] text-gray-400 truncate">{depthPath}</span>
                          )}
                        </div>
                        <p className="text-xs font-medium truncate">
                          {displayId && (
                            <span className="font-mono text-gray-400 mr-1">#{displayId}</span>
                          )}
                          {displayName}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-xs text-gray-700 line-clamp-2 leading-relaxed">{item.text}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        {item.issueNo ? (
                          <span className="text-[11px] font-mono text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded whitespace-nowrap">
                            {item.issueNo.startsWith('#') ? item.issueNo : `#${item.issueNo}`}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border whitespace-nowrap ${
                            item.raised
                              ? 'bg-orange-50 text-orange-600 border-orange-200'
                              : 'bg-gray-50 text-gray-300 border-gray-200'
                          }`}>
                            {item.raised ? '↑ 라이징' : '미라이징'}
                          </span>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border whitespace-nowrap ${
                            item.fixed
                              ? 'bg-green-50 text-green-600 border-green-200'
                              : 'bg-gray-50 text-gray-300 border-gray-200'
                          }`}>
                            {item.fixed ? '✓ 수정' : '미수정'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ══ 건별: 테이블 ═════════════════════════════════════════ */}
      {viewMode === 'by_source' && (
        filteredGroups.length === 0 ? (
          <p className="text-sm text-gray-400 py-10 text-center">해당하는 항목이 없습니다.</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm table-fixed">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[8%]">출처</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[9%]">시스템</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[31%]">기능/시나리오명</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[10%]">상태</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[18%]">이슈 현황</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[15%]">진행</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-[9%]">재테스트</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredGroups.map((group) => {
                  const isReq = group.sourceType === 'requirement'
                  const req = group.req
                  const scenario = group.scenario

                  const sysName = isReq
                    ? (req!.systems as any)?.name
                    : getScenarioSystemName(scenario!)
                  const depthPath = isReq
                    ? [req!.depth_0, req!.depth_1].filter(Boolean).join(' › ')
                    : null
                  const displayName = isReq ? (req!.feature_name ?? '(기능명 없음)') : scenario!.title
                  const displayId = isReq ? req!.display_id : null

                  const r = req?.currentResult
                  const items = isReq
                    ? (r?.issue_items ?? [])
                    : (scenario!.result?.issue_items ?? [])
                  const topSev = (['크리티컬', '하이', '미디엄', '로우'] as Severity[])
                    .find(s => items.some(i => i.severity === s))

                  const scnAllRaised = items.length > 0 && items.every(i => i.raised)
                  const scnAllFixed  = items.length > 0 && items.every(i => i.fixed)
                  const issueRaised = isReq ? r?.issue_raised : scnAllRaised
                  const issueFixed  = isReq ? r?.issue_fixed  : scnAllFixed
                  const resultStatus = isReq ? r?.status : scenario!.result?.status
                  const retestReason = isReq ? r?.retest_reason : null

                  return (
                    <tr
                      key={isReq ? `req-${req!.id}` : `scn-${scenario!.id}`}
                      onClick={() => isReq ? onSelectRequirement(req!) : onSelectScenario?.()}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                          isReq
                            ? 'bg-blue-50 text-blue-600 border-blue-200'
                            : 'bg-purple-50 text-purple-600 border-purple-200'
                        }`}>
                          {isReq ? '요구사항' : '시나리오'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${getSystemColor(sysName).badge}`}>
                          {sysName ?? '-'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 min-w-0">
                        {depthPath && (
                          <p className="text-[11px] text-gray-400 mb-0.5 truncate">{depthPath}</p>
                        )}
                        <p className="text-xs font-medium truncate">
                          {displayId && (
                            <span className="font-mono text-gray-400 mr-1">#{displayId}</span>
                          )}
                          {displayName}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={resultStatus ?? '미테스트'} />
                      </td>
                      <td className="px-3 py-2.5">
                        {items.length > 0 ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-xs font-medium ${
                              items.every(i => i.fixed) ? 'text-green-600' : 'text-gray-700'
                            }`}>
                              {items.filter(i => i.fixed).length}/{items.length}건
                            </span>
                            {topSev && (
                              <span className={`px-1.5 py-0 rounded text-[10px] font-medium border ${SEVERITY_STYLE[topSev].badge}`}>
                                {topSev}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                            issueRaised
                              ? 'bg-orange-50 text-orange-600 border-orange-200'
                              : 'bg-gray-50 text-gray-300 border-gray-200'
                          }`}>
                            {issueRaised ? '↑ 라이징' : '미라이징'}
                          </span>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                            issueFixed
                              ? 'bg-green-50 text-green-600 border-green-200'
                              : 'bg-gray-50 text-gray-300 border-gray-200'
                          }`}>
                            {issueFixed ? '✓ 수정' : '미수정'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {retestReason ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-600 border border-amber-200 whitespace-nowrap">
                            {retestReason}
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
        )
      )}
    </div>
  )
}
