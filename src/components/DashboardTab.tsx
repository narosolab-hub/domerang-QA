'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  getDashboardStats, getDepthGroupStats, getIssueStats,
  getScenarioStats, getScenarioIssueStats,
} from '@/lib/queries'
import { AIInsightsCard } from '@/components/AIInsightsCard'
import type { StatusCount, SystemStats, TestCycle } from '@/lib/types'
import type { DepthGroupStat, IssueStats, ScenarioStats, ScenarioIssueStats } from '@/lib/queries'

interface Props {
  cycleId: string
  cycle: TestCycle | null
  onSelectRequirement: (req: any) => void
  refreshKey: number
}

// ── 색상 상수 ──────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  Pass: 'bg-green-500',
  Fail: 'bg-red-500',
  Block: 'bg-yellow-500',
  'In Progress': 'bg-blue-500',
  '미테스트': 'bg-gray-200',
}
const STATUS_TEXT: Record<string, string> = {
  Pass: 'text-green-700',
  Fail: 'text-red-700',
  Block: 'text-yellow-700',
  'In Progress': 'text-blue-700',
  '미테스트': 'text-gray-400',
}
const RING_COLORS = [
  { key: 'Pass' as const, hex: '#22c55e' },
  { key: 'Fail' as const, hex: '#ef4444' },
  { key: 'Block' as const, hex: '#eab308' },
  { key: 'In Progress' as const, hex: '#3b82f6' },
]
const TYPE_BADGE: Record<string, string> = {
  integration: 'bg-purple-100 text-purple-700 border-purple-200',
  unit: 'bg-blue-100 text-blue-700 border-blue-200',
  e2e: 'bg-orange-100 text-orange-700 border-orange-200',
}

// ── SVG 링 차트 ───────────────────────────────────────────────────────────────
function RingChart({ counts, rate, size = 72 }: { counts: StatusCount; rate: number; size?: number }) {
  const sw = 9
  const r = (size - sw) / 2
  const cx = size / 2
  const cy = size / 2
  const circ = 2 * Math.PI * r
  const total = counts.total
  let cumulative = 0
  const arcs = RING_COLORS
    .filter(({ key }) => counts[key] > 0)
    .map(({ key, hex }) => {
      const startAngle = (cumulative / total) * 360 - 90
      const dash = (counts[key] / total) * circ
      cumulative += counts[key]
      return { hex, dash, gap: circ - dash, startAngle }
    })
  const rateColor = rate === 100 ? '#16a34a' : rate >= 70 ? '#2563eb' : rate >= 30 ? '#d97706' : '#6b7280'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={sw} />
      {arcs.map((arc, i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={arc.hex} strokeWidth={sw}
          strokeDasharray={`${arc.dash} ${arc.gap}`}
          transform={`rotate(${arc.startAngle} ${cx} ${cy})`} />
      ))}
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
        fontSize={size < 64 ? 10 : 13} fontWeight="700" fill={rateColor}>{rate}%</text>
    </svg>
  )
}

// ── 진행 바 ──────────────────────────────────────────────────────────────────
function ProgressBar({ counts, total, height = 'h-2.5' }: { counts: Record<string, number> | StatusCount; total: number; height?: string }) {
  return (
    <div className={`w-full ${height} rounded-full overflow-hidden bg-gray-100 flex`}>
      {total > 0 && (['Pass', 'Fail', 'Block', 'In Progress'] as const).map(s => {
        const pct = ((counts[s] ?? 0) / total) * 100
        return pct > 0
          ? <div key={s} className={`h-full ${STATUS_COLORS[s]}`} style={{ width: `${pct}%` }} title={`${s}: ${counts[s]}`} />
          : null
      })}
    </div>
  )
}

// ── 진행률 숫자 색상 ──────────────────────────────────────────────────────────
function rateColor(rate: number) {
  return rate === 100 ? 'text-green-600' : rate >= 50 ? 'text-blue-600' : 'text-gray-600'
}

// ── 시스템별 미니 행 ──────────────────────────────────────────────────────────
function SystemRow({ name, counts, rate }: { name: string; counts: StatusCount; rate: number }) {
  const done = counts.Pass + counts.Fail + counts.Block + counts['In Progress']
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="font-medium text-gray-700">{name}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-gray-400">{done}/{counts.total}</span>
          <span className={`font-semibold min-w-[3ch] text-right ${rateColor(rate)}`}>{rate}%</span>
        </div>
      </div>
      <ProgressBar counts={counts} total={counts.total} />
    </div>
  )
}

// ── 이슈 진행 행 ──────────────────────────────────────────────────────────────
function IssueRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const rate = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold">{value}<span className="text-gray-400 font-normal">/{total} ({rate}%)</span></span>
      </div>
      <div className="w-full h-2 rounded-full overflow-hidden bg-gray-100">
        {total > 0 && <div className={`h-full transition-all ${color}`} style={{ width: `${rate}%` }} />}
      </div>
    </div>
  )
}

// ── 기능 영역 카드 ────────────────────────────────────────────────────────────
const STAT_ITEMS = [
  { key: 'Pass' as const, dot: '#22c55e', text: 'text-green-700' },
  { key: 'Fail' as const, dot: '#ef4444', text: 'text-red-700' },
  { key: 'Block' as const, dot: '#eab308', text: 'text-yellow-700' },
  { key: 'In Progress' as const, dot: '#3b82f6', text: 'text-blue-700' },
  { key: '미테스트' as const, dot: '#d1d5db', text: 'text-gray-400' },
]
function AreaCard({ systemName, depth_0, counts, progressRate, showSystem }: {
  systemName: string; depth_0: string; counts: StatusCount; progressRate: number; showSystem: boolean
}) {
  const hasIssue = counts.Fail > 0 || counts.Block > 0
  const done = counts.Pass + counts.Fail + counts.Block + counts['In Progress']
  return (
    <div className={`border rounded-xl p-4 bg-white hover:shadow-md transition-shadow ${hasIssue ? 'border-red-200' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          {showSystem && <Badge variant="secondary" className="text-[11px] mb-1 font-normal">{systemName}</Badge>}
          <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2">{depth_0}</p>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
          progressRate === 100 ? 'bg-green-100 text-green-700' : progressRate >= 50 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
        }`}>{done}/{counts.total}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="shrink-0"><RingChart counts={counts} rate={progressRate} /></div>
        <div className="flex-1 space-y-1 min-w-0">
          {STAT_ITEMS.filter(({ key }) => counts[key] > 0).map(({ key, dot, text }) => (
            <div key={key} className="flex items-center justify-between text-xs">
              <span className={`flex items-center gap-1.5 ${text}`}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dot }} />
                {key}
              </span>
              <span className="font-semibold tabular-nums">{counts[key]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── 메인 ──────────────────────────────────────────────────────────────────────
export function DashboardTab({ cycleId, cycle, refreshKey }: Props) {
  const [reqStats, setReqStats] = useState<{ total: StatusCount; bySystem: SystemStats[] } | null>(null)
  const [depthStats, setDepthStats] = useState<DepthGroupStat[]>([])
  const [issueStats, setIssueStats] = useState<IssueStats | null>(null)
  const [scenarioStats, setScenarioStats] = useState<ScenarioStats | null>(null)
  const [scenarioIssueStats, setScenarioIssueStats] = useState<ScenarioIssueStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedSystemTab, setSelectedSystemTab] = useState<string>('all')
  const [areaOpen, setAreaOpen] = useState(false)

  useEffect(() => {
    if (!cycleId) return
    setLoading(true)
    Promise.all([
      getDashboardStats(cycleId),
      getDepthGroupStats(cycleId),
      getIssueStats(cycleId),
      getScenarioStats(cycleId),
      getScenarioIssueStats(cycleId),
    ]).then(([rs, d, is, ss, sis]) => {
      setReqStats(rs)
      setDepthStats(d)
      setIssueStats(is)
      setScenarioStats(ss)
      setScenarioIssueStats(sis)
    }).finally(() => setLoading(false))
  }, [cycleId, refreshKey])

  if (!cycleId) return <div className="text-center py-20 text-gray-400">상단에서 테스트 사이클을 선택하세요</div>
  if (loading) return <div className="text-center py-20 text-gray-400">로딩 중...</div>
  if (!reqStats) return null

  const { total, bySystem } = reqStats
  const reqDone = total.Pass + total.Fail + total.Block + total['In Progress']
  const reqRate = total.total > 0 ? Math.round((reqDone / total.total) * 100) : 0

  const scTotal = scenarioStats?.total ?? 0
  const scDone = scTotal > 0
    ? (scenarioStats!.byStatus['Pass'] ?? 0) + (scenarioStats!.byStatus['Fail'] ?? 0)
      + (scenarioStats!.byStatus['Block'] ?? 0) + (scenarioStats!.byStatus['In Progress'] ?? 0)
    : 0
  const scRate = scenarioStats?.progressRate ?? 0

  const reqIssueTotal = (issueStats?.failCount ?? 0) + (issueStats?.blockCount ?? 0)
  const scIssueTotal = (scenarioIssueStats?.failCount ?? 0) + (scenarioIssueStats?.blockCount ?? 0)

  return (
    <div className="space-y-5">

      {/* ── 사이클 정보 ──────────────────────────────────────────────────────── */}
      {cycle && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm px-3 py-1">{cycle.name}</Badge>
          {cycle.started_at && (
            <span className="text-xs text-gray-500">{new Date(cycle.started_at).toLocaleDateString('ko-KR')} 시작</span>
          )}
        </div>
      )}

      {/* ── KPI 요약 ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 요구사항 테스트 진행률 */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">
          <RingChart counts={total} rate={reqRate} size={64} />
          <div className="min-w-0">
            <p className="text-xs text-gray-500 font-medium mb-0.5">요구사항 테스트</p>
            <p className="text-2xl font-bold text-gray-900 leading-none">{reqDone}<span className="text-sm font-normal text-gray-400">/{total.total}</span></p>
            <p className="text-xs text-gray-400 mt-0.5">완료</p>
          </div>
        </div>

        {/* 시나리오 테스트 진행률 */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">
          {scenarioStats && scTotal > 0
            ? <RingChart counts={{
                Pass: scenarioStats.byStatus['Pass'] ?? 0,
                Fail: scenarioStats.byStatus['Fail'] ?? 0,
                Block: scenarioStats.byStatus['Block'] ?? 0,
                'In Progress': scenarioStats.byStatus['In Progress'] ?? 0,
                '미테스트': scenarioStats.byStatus['미테스트'] ?? 0,
                total: scTotal,
              }} rate={scRate} size={64} />
            : <div className="w-16 h-16 rounded-full border-4 border-gray-100 flex items-center justify-center text-xs text-gray-400 shrink-0">-</div>
          }
          <div className="min-w-0">
            <p className="text-xs text-gray-500 font-medium mb-0.5">시나리오 테스트</p>
            <p className="text-2xl font-bold text-gray-900 leading-none">{scDone}<span className="text-sm font-normal text-gray-400">/{scTotal}</span></p>
            <p className="text-xs text-gray-400 mt-0.5">완료</p>
          </div>
        </div>
      </div>

      {/* ── 요구사항 현황 | 시나리오 현황 ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* 요구사항 현황 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">요구사항 테스트 현황</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 스탯 칩 */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: '전체',    value: total.total,          cls: 'bg-gray-50 border-gray-200' },
                { label: 'Pass',   value: total.Pass,           cls: 'bg-green-50 border-green-200' },
                { label: 'Fail',   value: total.Fail,           cls: 'bg-red-50 border-red-200' },
                { label: 'Block',  value: total.Block,          cls: 'bg-yellow-50 border-yellow-200' },
                { label: '진행중', value: total['In Progress'], cls: 'bg-blue-50 border-blue-200' },
                { label: '미테스트', value: total['미테스트'],  cls: 'bg-gray-50 border-gray-200' },
              ].map(({ label, value, cls }) => (
                <div key={label} className={`text-center p-2.5 rounded-lg border ${cls}`}>
                  <div className="text-xl font-bold">{value}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
            {/* 진행 바 */}
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-gray-500">진행률</span>
                <span className={`font-semibold ${rateColor(reqRate)}`}>{reqRate}%</span>
              </div>
              <ProgressBar counts={total} total={total.total} height="h-3" />
            </div>
            {/* 시스템별 */}
            {bySystem.length > 1 && (
              <div className="space-y-3 pt-1 border-t border-gray-100">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">시스템별</p>
                {bySystem.map(({ system, counts, progressRate: rate }) => (
                  <SystemRow key={system.id} name={system.name} counts={counts} rate={rate} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 시나리오 현황 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">시나리오 테스트 현황</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!scenarioStats || scTotal === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">등록된 활성 시나리오가 없습니다</div>
            ) : (
              <>
                {/* 스탯 칩 */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: '전체',    value: scTotal,                                    cls: 'bg-gray-50 border-gray-200' },
                    { label: 'Pass',   value: scenarioStats.byStatus['Pass'] ?? 0,        cls: 'bg-green-50 border-green-200' },
                    { label: 'Fail',   value: scenarioStats.byStatus['Fail'] ?? 0,        cls: 'bg-red-50 border-red-200' },
                    { label: 'Block',  value: scenarioStats.byStatus['Block'] ?? 0,       cls: 'bg-yellow-50 border-yellow-200' },
                    { label: '진행중', value: scenarioStats.byStatus['In Progress'] ?? 0, cls: 'bg-blue-50 border-blue-200' },
                    { label: '미테스트', value: scenarioStats.byStatus['미테스트'] ?? 0,  cls: 'bg-gray-50 border-gray-200' },
                  ].map(({ label, value, cls }) => (
                    <div key={label} className={`text-center p-2.5 rounded-lg border ${cls}`}>
                      <div className="text-xl font-bold">{value}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
                {/* 진행 바 */}
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-gray-500">진행률</span>
                    <span className={`font-semibold ${rateColor(scRate)}`}>{scRate}%</span>
                  </div>
                  <ProgressBar counts={scenarioStats.byStatus} total={scTotal} height="h-3" />
                </div>
                {/* 유형별 */}
                {scenarioStats.byType.length > 0 && (
                  <div className="space-y-3 pt-1 border-t border-gray-100">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">유형별</p>
                    {scenarioStats.byType.map(({ type, label, total: t, byStatus }) => {
                      const tDone = (byStatus['Pass'] ?? 0) + (byStatus['Fail'] ?? 0) + (byStatus['Block'] ?? 0) + (byStatus['In Progress'] ?? 0)
                      const tRate = t > 0 ? Math.round((tDone / t) * 100) : 0
                      return (
                        <div key={type}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className={`font-medium px-1.5 py-0.5 rounded border text-[11px] ${TYPE_BADGE[type]}`}>{label}</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-gray-400">{tDone}/{t}</span>
                              <span className={`font-semibold min-w-[3ch] text-right ${rateColor(tRate)}`}>{tRate}%</span>
                            </div>
                          </div>
                          <ProgressBar counts={byStatus} total={t} />
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── 이슈 현황 ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* 요구사항 이슈 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">요구사항 이슈 현황</CardTitle>
          </CardHeader>
          <CardContent>
            {reqIssueTotal === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">Fail / Block 항목이 없습니다</div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg border bg-red-50 border-red-200 text-center">
                    <div className="text-2xl font-bold text-red-600">{issueStats!.failCount}</div>
                    <div className="text-xs text-gray-500 mt-0.5">Fail</div>
                  </div>
                  <div className="p-3 rounded-lg border bg-yellow-50 border-yellow-200 text-center">
                    <div className="text-2xl font-bold text-yellow-600">{issueStats!.blockCount}</div>
                    <div className="text-xs text-gray-500 mt-0.5">Block</div>
                  </div>
                </div>
                {issueStats!.itemsTotal > 0 ? (
                  <div className="space-y-3">
                    <IssueRow label="이슈 항목 라이징" value={issueStats!.itemsRaised} total={issueStats!.itemsTotal} color="bg-orange-400" />
                    <IssueRow label="수정 완료" value={issueStats!.itemsFixed} total={issueStats!.itemsTotal} color="bg-green-500" />
                    <p className="text-xs text-gray-400">* 이슈 항목 {issueStats!.itemsTotal}건 기준</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <IssueRow label="이슈라이징 완료 (건)" value={issueStats!.issueRaisedCount} total={reqIssueTotal} color="bg-orange-400" />
                    <IssueRow label="수정 완료 (건)" value={issueStats!.issueFixedCount} total={issueStats!.issueRaisedCount} color="bg-green-500" />
                    <p className="text-xs text-gray-400">* 수정 완료는 라이징 완료 건 기준</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 시나리오 이슈 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">시나리오 이슈 현황</CardTitle>
          </CardHeader>
          <CardContent>
            {scIssueTotal === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">Fail / Block 시나리오가 없습니다</div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg border bg-red-50 border-red-200 text-center">
                    <div className="text-2xl font-bold text-red-600">{scenarioIssueStats!.failCount}</div>
                    <div className="text-xs text-gray-500 mt-0.5">Fail</div>
                  </div>
                  <div className="p-3 rounded-lg border bg-yellow-50 border-yellow-200 text-center">
                    <div className="text-2xl font-bold text-yellow-600">{scenarioIssueStats!.blockCount}</div>
                    <div className="text-xs text-gray-500 mt-0.5">Block</div>
                  </div>
                </div>
                {scenarioIssueStats!.itemsTotal > 0 ? (
                  <div className="space-y-3">
                    <IssueRow label="이슈 항목 라이징" value={scenarioIssueStats!.itemsRaised} total={scenarioIssueStats!.itemsTotal} color="bg-orange-400" />
                    <IssueRow label="수정 완료" value={scenarioIssueStats!.itemsFixed} total={scenarioIssueStats!.itemsTotal} color="bg-green-500" />
                    <p className="text-xs text-gray-400">* 이슈 항목 {scenarioIssueStats!.itemsTotal}건 기준</p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 pt-2">이슈 항목이 등록되지 않았습니다</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── 기능 영역별 현황 (아코디언) ──────────────────────────────────────── */}
      {depthStats.length > 0 && (() => {
        const systemIds = ['all', ...Array.from(new Set(depthStats.map(d => d.systemId)))]
        const systemLabels: Record<string, string> = { all: '전체' }
        depthStats.forEach(d => { systemLabels[d.systemId] = d.systemName })
        const filtered = selectedSystemTab === 'all'
          ? depthStats
          : depthStats.filter(d => d.systemId === selectedSystemTab)

        return (
          <Card>
            <button onClick={() => setAreaOpen(prev => !prev)} className="w-full text-left">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">기능 영역별 현황</CardTitle>
                    {areaOpen
                      ? <ChevronUp className="h-4 w-4 text-gray-400" />
                      : <ChevronDown className="h-4 w-4 text-gray-400" />
                    }
                  </div>
                  {areaOpen && (
                    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                      {systemIds.map(sysId => (
                        <button
                          key={sysId}
                          onClick={() => setSelectedSystemTab(sysId)}
                          className={`px-2.5 py-0.5 rounded text-xs font-medium transition-colors ${
                            selectedSystemTab === sysId
                              ? 'bg-gray-800 text-white'
                              : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                          }`}
                        >
                          {systemLabels[sysId]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </CardHeader>
            </button>
            {areaOpen && (
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filtered.map(({ systemId, systemName, depth_0, counts, progressRate: rate }) => (
                    <AreaCard
                      key={`${systemId}_${depth_0}`}
                      systemName={systemName}
                      depth_0={depth_0}
                      counts={counts}
                      progressRate={rate}
                      showSystem={selectedSystemTab === 'all'}
                    />
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        )
      })()}

      <AIInsightsCard cycleId={cycleId} />
    </div>
  )
}
