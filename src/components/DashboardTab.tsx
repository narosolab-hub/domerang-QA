'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getDashboardStats, getDepthGroupStats, getIssueStats } from '@/lib/queries'
import type { StatusCount, SystemStats, TestCycle } from '@/lib/types'
import type { DepthGroupStat, IssueStats } from '@/lib/queries'

interface Props {
  cycleId: string
  cycle: TestCycle | null
  onSelectRequirement: (req: any) => void
  refreshKey: number
}

const STATUS_COLORS: Record<string, string> = {
  Pass: 'bg-green-500',
  Fail: 'bg-red-500',
  Block: 'bg-yellow-500',
  'In Progress': 'bg-blue-500',
  '미테스트': 'bg-gray-200',
}

const STATUS_TEXT_COLORS: Record<string, string> = {
  Pass: 'text-green-700',
  Fail: 'text-red-700',
  Block: 'text-yellow-700',
  'In Progress': 'text-blue-700',
  '미테스트': 'text-gray-400',
}

// ── SVG 링 차트 ───────────────────────────────────────────────────────────────
const RING_COLORS = [
  { key: 'Pass' as const, hex: '#22c55e' },
  { key: 'Fail' as const, hex: '#ef4444' },
  { key: 'Block' as const, hex: '#eab308' },
  { key: 'In Progress' as const, hex: '#3b82f6' },
]

function RingChart({ counts, rate, size = 72 }: { counts: StatusCount; rate: number; size?: number }) {
  const sw = 9                              // stroke width
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

  const rateColor =
    rate === 100 ? '#16a34a' : rate >= 70 ? '#2563eb' : rate >= 30 ? '#d97706' : '#6b7280'

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* 배경 회색 링 (미테스트 영역) */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={sw} />
      {/* 상태별 색 아크 */}
      {arcs.map((arc, i) => (
        <circle
          key={i}
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={arc.hex}
          strokeWidth={sw}
          strokeDasharray={`${arc.dash} ${arc.gap}`}
          transform={`rotate(${arc.startAngle} ${cx} ${cy})`}
        />
      ))}
      {/* 중앙 진행률 텍스트 */}
      <text
        x={cx} y={cy}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={size < 64 ? 10 : 13}
        fontWeight="700"
        fill={rateColor}
      >
        {rate}%
      </text>
    </svg>
  )
}

// ── 기능 영역 카드 ────────────────────────────────────────────────────────────
const STAT_ITEMS = [
  { key: 'Pass' as const,         label: 'Pass',    dot: '#22c55e', text: 'text-green-700' },
  { key: 'Fail' as const,         label: 'Fail',    dot: '#ef4444', text: 'text-red-700'   },
  { key: 'Block' as const,        label: 'Block',   dot: '#eab308', text: 'text-yellow-700'},
  { key: 'In Progress' as const,  label: '진행중',   dot: '#3b82f6', text: 'text-blue-700'  },
  { key: '미테스트' as const,      label: '미테스트', dot: '#d1d5db', text: 'text-gray-400'  },
]

function AreaCard({
  systemName,
  depth_0,
  counts,
  progressRate,
  showSystem,
}: {
  systemName: string
  depth_0: string
  counts: StatusCount
  progressRate: number
  showSystem: boolean
}) {
  const done = counts.Pass + counts.Fail + counts.Block + counts['In Progress']
  const hasIssue = counts.Fail > 0 || counts.Block > 0

  return (
    <div className={`border rounded-xl p-4 bg-white hover:shadow-md transition-shadow ${
      hasIssue ? 'border-red-200' : 'border-gray-200'
    }`}>
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          {showSystem && (
            <Badge variant="secondary" className="text-[11px] mb-1 font-normal">{systemName}</Badge>
          )}
          <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2">{depth_0}</p>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
          progressRate === 100
            ? 'bg-green-100 text-green-700'
            : progressRate >= 50
            ? 'bg-blue-100 text-blue-700'
            : 'bg-gray-100 text-gray-500'
        }`}>
          {done}/{counts.total}
        </span>
      </div>

      {/* 링 차트 + 상태 수치 */}
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          <RingChart counts={counts} rate={progressRate} />
        </div>
        <div className="flex-1 space-y-1 min-w-0">
          {STAT_ITEMS.filter(({ key }) => counts[key] > 0).map(({ key, label, dot, text }) => (
            <div key={key} className="flex items-center justify-between text-xs">
              <span className={`flex items-center gap-1.5 ${text}`}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dot }} />
                {label}
              </span>
              <span className="font-semibold tabular-nums">{counts[key]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── 시스템별 진행 행 ───────────────────────────────────────────────────────────
function SystemProgressRow({ name, counts, rate }: { name: string; counts: StatusCount; rate: number }) {
  const done = counts.Pass + counts.Fail + counts.Block + counts['In Progress']
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="font-medium">{name}</span>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="text-gray-400 text-xs">{done}/{counts.total}</span>
          <span className={`font-semibold text-sm min-w-[3ch] text-right ${
            rate === 100 ? 'text-green-600' : rate >= 50 ? 'text-blue-600' : 'text-gray-700'
          }`}>{rate}%</span>
        </div>
      </div>
      <div className="w-full h-2.5 rounded-full overflow-hidden bg-gray-100 flex">
        {counts.total > 0 && (['Pass', 'Fail', 'Block', 'In Progress'] as const).map(s => {
          const pct = (counts[s] / counts.total) * 100
          return pct > 0 ? (
            <div key={s} className={`h-full ${STATUS_COLORS[s]}`} style={{ width: `${pct}%` }} title={`${s}: ${counts[s]}`} />
          ) : null
        })}
      </div>
      <div className="flex gap-2 mt-1 flex-wrap">
        {(['Pass', 'Fail', 'Block', 'In Progress', '미테스트'] as const).map(s =>
          counts[s] > 0 ? (
            <span key={s} className={`text-xs ${STATUS_TEXT_COLORS[s]}`}>
              {s === '미테스트' ? '미테스트' : s}: {counts[s]}
            </span>
          ) : null
        )}
      </div>
    </div>
  )
}

// ── 이슈 진행 행 ───────────────────────────────────────────────────────────────
function IssueProgressRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const rate = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div>
      <div className="flex justify-between text-sm mb-1.5">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold">
          {value} / {total}
          <span className="text-gray-400 font-normal ml-1">({rate}%)</span>
        </span>
      </div>
      <div className="w-full h-2.5 rounded-full overflow-hidden bg-gray-100">
        {total > 0 && (
          <div className={`h-full transition-all ${color}`} style={{ width: `${rate}%` }} />
        )}
      </div>
    </div>
  )
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────
export function DashboardTab({ cycleId, cycle, onSelectRequirement, refreshKey }: Props) {
  const [stats, setStats] = useState<{ total: StatusCount; bySystem: SystemStats[] } | null>(null)
  const [depthStats, setDepthStats] = useState<DepthGroupStat[]>([])
  const [issueStats, setIssueStats] = useState<IssueStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedSystemTab, setSelectedSystemTab] = useState<string>('all')

  useEffect(() => {
    if (!cycleId) return
    setLoading(true)
    Promise.all([
      getDashboardStats(cycleId),
      getDepthGroupStats(cycleId),
      getIssueStats(cycleId),
    ]).then(([s, d, i]) => {
      setStats(s)
      setDepthStats(d)
      setIssueStats(i)
    }).finally(() => setLoading(false))
  }, [cycleId, refreshKey])

  if (!cycleId) {
    return <div className="text-center py-20 text-gray-400">상단에서 테스트 사이클을 선택하세요</div>
  }
  if (loading) {
    return <div className="text-center py-20 text-gray-400">로딩 중...</div>
  }
  if (!stats) return null

  const { total, bySystem } = stats
  const done = total.Pass + total.Fail + total.Block + total['In Progress']
  const progressRate = total.total > 0 ? Math.round((done / total.total) * 100) : 0
  const issueTotal = (issueStats?.failCount ?? 0) + (issueStats?.blockCount ?? 0)

  return (
    <div className="space-y-5">
      {/* 사이클 정보 */}
      {cycle && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm px-3 py-1">{cycle.name}</Badge>
          {cycle.started_at && (
            <span className="text-xs text-gray-500">
              {new Date(cycle.started_at).toLocaleDateString('ko-KR')} 시작
            </span>
          )}
        </div>
      )}

      {/* 전체 현황 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">전체 현황</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
            {[
              { label: '전체',    value: total.total,           cls: 'bg-gray-50 border-gray-200' },
              { label: 'Pass',   value: total.Pass,            cls: 'bg-green-50 border-green-200' },
              { label: 'Fail',   value: total.Fail,            cls: 'bg-red-50 border-red-200' },
              { label: 'Block',  value: total.Block,           cls: 'bg-yellow-50 border-yellow-200' },
              { label: '진행중', value: total['In Progress'],  cls: 'bg-blue-50 border-blue-200' },
              { label: '미테스트',value: total['미테스트'],     cls: 'bg-gray-50 border-gray-200' },
            ].map(({ label, value, cls }) => (
              <div key={label} className={`text-center p-3 rounded-lg border ${cls}`}>
                <div className="text-2xl font-bold">{value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          <div className="flex justify-between text-sm mb-1.5">
            <span className="text-gray-600">테스트 진행률</span>
            <span className="font-semibold">{progressRate}%</span>
          </div>
          <div className="w-full h-3 rounded-full overflow-hidden bg-gray-100 flex">
            {total.total > 0 && (['Pass', 'Fail', 'Block', 'In Progress'] as const).map(s => {
              const pct = (total[s] / total.total) * 100
              return pct > 0 ? (
                <div key={s} className={`h-full ${STATUS_COLORS[s]}`} style={{ width: `${pct}%` }} title={`${s}: ${total[s]}`} />
              ) : null
            })}
          </div>
          <div className="flex gap-3 mt-2 flex-wrap">
            {(['Pass', 'Fail', 'Block', 'In Progress', '미테스트'] as const).map(s =>
              total[s] > 0 ? (
                <span key={s} className={`text-xs flex items-center gap-1 ${STATUS_TEXT_COLORS[s]}`}>
                  <span className={`inline-block w-2 h-2 rounded-full ${STATUS_COLORS[s]}`} />
                  {s}: {total[s]}
                </span>
              ) : null
            )}
          </div>
        </CardContent>
      </Card>

      {/* 시스템별 현황 + 이슈 현황 — 2열 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">시스템별 현황</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {bySystem.map(({ system, counts, progressRate: rate }) => (
                <SystemProgressRow key={system.id} name={system.name} counts={counts} rate={rate} />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">이슈 현황</CardTitle>
          </CardHeader>
          <CardContent>
            {issueTotal === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">Fail / Block 항목이 없습니다</div>
            ) : (
              <div className="space-y-5">
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
                <IssueProgressRow label="이슈라이징 완료" value={issueStats!.issueRaisedCount} total={issueTotal} color="bg-orange-400" />
                <IssueProgressRow label="수정 완료" value={issueStats!.issueFixedCount} total={issueStats!.issueRaisedCount} color="bg-green-500" />
                <p className="text-xs text-gray-400">* 수정 완료는 이슈라이징 완료 건 기준</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 기능 영역별 현황 — 링 차트 카드 그리드 */}
      {depthStats.length > 0 && (() => {
        const systemIds = ['all', ...Array.from(new Set(depthStats.map(d => d.systemId)))]
        const systemLabels: Record<string, string> = { all: '전체' }
        depthStats.forEach(d => { systemLabels[d.systemId] = d.systemName })

        const filtered = selectedSystemTab === 'all'
          ? depthStats
          : depthStats.filter(d => d.systemId === selectedSystemTab)

        return (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">기능 영역별 현황</CardTitle>
                <div className="flex gap-1">
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
              </div>
            </CardHeader>
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
          </Card>
        )
      })()}
    </div>
  )
}
