'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react'
import { getScenarioDetail, upsertScenarioResult, type ScenarioDetail } from '@/lib/queries'
import type { TestStatus, IssueItem } from '@/lib/types'
import { getSystemColor } from '@/lib/types'

const TYPE_BADGE: Record<string, string> = {
  integration: 'bg-purple-100 text-purple-700 border-purple-200',
  unit:        'bg-blue-100 text-blue-700 border-blue-200',
  e2e:         'bg-orange-100 text-orange-700 border-orange-200',
}
const TYPE_LABEL: Record<string, string> = {
  integration: '통합', unit: '단위', e2e: 'E2E',
}
const STATUS_COLORS: Record<TestStatus, { text: string; bg: string; border: string }> = {
  'Pass':        { text: 'text-white', bg: 'bg-green-500',  border: 'border-green-500' },
  'Fail':        { text: 'text-white', bg: 'bg-red-500',    border: 'border-red-500' },
  'Block':       { text: 'text-white', bg: 'bg-gray-700',   border: 'border-gray-700' },
  'In Progress': { text: 'text-white', bg: 'bg-blue-500',   border: 'border-blue-500' },
  '미테스트':    { text: 'text-gray-500', bg: 'bg-gray-100', border: 'border-gray-200' },
}
const TEST_STATUSES: TestStatus[] = ['Pass', 'Fail', 'Block', 'In Progress', '미테스트']

interface Props {
  scenarioId: string | null
  cycleId: string
  onClose: () => void
  onOpenFull: (id: string) => void
}

export function ScenarioSidePanel({ scenarioId, cycleId, onClose, onOpenFull }: Props) {
  const [detail, setDetail] = useState<ScenarioDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [resultStatus, setResultStatus] = useState<TestStatus>('미테스트')
  const [issueItems, setIssueItems] = useState<IssueItem[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [wide, setWide] = useState(true) // 기본값: 넓게

  const load = useCallback(async (id: string) => {
    setLoading(true)
    setDetail(null)
    try {
      const d = await getScenarioDetail(id, cycleId)
      if (!d) return
      setDetail(d)
      setResultStatus(d.result?.status ?? '미테스트')
      setIssueItems(d.result?.issue_items ?? [])
    } finally {
      setLoading(false)
    }
  }, [cycleId])

  useEffect(() => {
    if (scenarioId) load(scenarioId)
    else setDetail(null)
  }, [scenarioId, load])

  async function handleStatusClick(status: TestStatus) {
    if (!detail) return
    const prev = resultStatus
    setResultStatus(status)
    try {
      await upsertScenarioResult({ scenario_id: detail.id, cycle_id: cycleId, status, issue_items: issueItems })
    } catch { setResultStatus(prev) }
  }

  async function saveItems(next: IssueItem[]) {
    if (!detail) return
    setIssueItems(next)
    setSaving(true)
    try {
      await upsertScenarioResult({ scenario_id: detail.id, cycle_id: cycleId, status: resultStatus, issue_items: next })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally { setSaving(false) }
  }

  function handleToggleIssueItem(idx: number, field: 'raised' | 'fixed') {
    const next = issueItems.map((item, i) =>
      i === idx ? { ...item, [field]: !item[field] } : item
    )
    saveItems(next)
  }

  function handleIssueNoChange(idx: number, val: string) {
    const next = issueItems.map((item, i) =>
      i === idx ? { ...item, issueNo: val.replace(/^#+/, '') } : item
    )
    setIssueItems(next) // 타이핑 중은 로컬만
  }

  function handleIssueNoBlur(idx: number) {
    saveItems([...issueItems]) // blur 시 저장
  }

  const isOpen = !!scenarioId

  return (
    <>
      {/* 오버레이 */}
      {isOpen && (
        <div className="fixed inset-0 z-30 bg-black/10" onClick={onClose} />
      )}

      {/* 패널 */}
      <aside
        className={`fixed top-0 right-0 h-full z-40 bg-white border-l border-gray-200 shadow-xl flex flex-col transition-[width,transform] duration-200 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ width: wide ? '65vw' : 420 }}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            {/* 너비 토글: wide면 > 눌러서 좁히기, narrow면 < 눌러서 넓히기 */}
            <button
              onClick={() => setWide(w => !w)}
              className="p-1 text-gray-400 hover:text-gray-700 rounded transition-colors"
              title={wide ? '패널 좁히기' : '패널 넓히기'}
            >
              {wide ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">시나리오 이슈</span>
          </div>
          <div className="flex items-center gap-1">
            {detail && (
              <button
                onClick={() => onOpenFull(detail.id)}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded px-2 py-1 hover:bg-indigo-50 transition-colors"
              >
                시나리오 탭에서 보기
                <ExternalLink className="h-3 w-3" />
              </button>
            )}
            <button onClick={onClose} className="ml-1 p-1 text-gray-400 hover:text-gray-700 rounded transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
          {loading && (
            <div className="flex items-center justify-center h-32 text-sm text-gray-400">불러오는 중...</div>
          )}

          {!loading && !detail && scenarioId && (
            <div className="flex items-center justify-center h-32 text-sm text-gray-400">시나리오를 불러올 수 없습니다.</div>
          )}

          {detail && (
            <>
              {/* 타입 + 시스템 태그 */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${TYPE_BADGE[detail.scenario_type]}`}>
                  {TYPE_LABEL[detail.scenario_type]}
                </span>
                {(detail.system_ids ?? []).map(sid => {
                  const sys = (detail as any).systems?.find?.((s: any) => s.id === sid)
                  const name = sys?.name ?? sid
                  const sc = getSystemColor(name)
                  return (
                    <span key={sid} className={`text-xs px-1.5 py-0.5 rounded border font-medium ${sc.tag}`}>{name}</span>
                  )
                })}
              </div>

              {/* 제목 */}
              <h2 className="text-base font-semibold text-gray-900 leading-snug">{detail.title}</h2>

              {/* 테스트 상태 */}
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">테스트 상태</h3>
                <div className="flex flex-wrap gap-1.5">
                  {TEST_STATUSES.map(s => {
                    const sc = STATUS_COLORS[s]
                    const active = resultStatus === s
                    return (
                      <button
                        key={s}
                        onClick={() => handleStatusClick(s)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          active
                            ? `${sc.bg} ${sc.text} ${sc.border}`
                            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                        }`}
                      >
                        {s}
                      </button>
                    )
                  })}
                </div>
              </section>

              {/* 이슈 항목 */}
              {issueItems.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">이슈 항목</h3>
                    {saving && <span className="text-[10px] text-gray-400">저장 중...</span>}
                    {!saving && saved && <span className="text-[10px] text-green-600">✓ 저장됨</span>}
                  </div>
                  <div className="flex flex-col gap-2">
                    {issueItems.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-2 p-2.5 rounded-lg border border-gray-100 bg-gray-50">
                        <span className="flex-1 text-xs text-gray-700 leading-relaxed pt-0.5">{item.text}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {/* 라이징 완료 시 #이슈번호 입력 필드 노출 */}
                          {item.raised && (
                            <div className="flex items-center gap-0.5 border border-orange-200 rounded bg-orange-50 px-1.5 py-0.5">
                              <span className="text-[11px] font-mono text-orange-400">#</span>
                              <input
                                type="text"
                                value={(item.issueNo ?? '').replace(/^#+/, '')}
                                onChange={e => handleIssueNoChange(idx, e.target.value)}
                                onBlur={() => handleIssueNoBlur(idx)}
                                onClick={e => e.stopPropagation()}
                                placeholder="번호"
                                className="w-12 text-[11px] font-mono bg-transparent text-orange-700 placeholder:text-orange-300 outline-none"
                              />
                            </div>
                          )}
                          <button
                            onClick={() => handleToggleIssueItem(idx, 'raised')}
                            className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                              item.raised
                                ? 'bg-orange-100 text-orange-700 border-orange-300'
                                : 'bg-white text-gray-400 border-gray-200 hover:border-orange-300'
                            }`}
                          >
                            라이징
                          </button>
                          <button
                            onClick={() => handleToggleIssueItem(idx, 'fixed')}
                            className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                              item.fixed
                                ? 'bg-green-100 text-green-700 border-green-300'
                                : 'bg-white text-gray-400 border-gray-200 hover:border-green-300'
                            }`}
                          >
                            수정완료
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 연결된 요구사항 */}
              {detail.linkedRequirements.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    연결된 요구사항 ({detail.linkedRequirements.length})
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.linkedRequirements.map(lr => {
                      const sysName = (lr.requirement?.systems as any)?.name ?? ''
                      const sc = getSystemColor(sysName)
                      return (
                        <span key={lr.id}
                          className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${sc.chip}`}>
                          {sysName && <span className={`text-[10px] px-1 rounded ${sc.tag}`}>{sysName}</span>}
                          #{lr.requirement?.display_id} {lr.requirement?.feature_name}
                        </span>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* 비즈니스 맥락 */}
              {detail.business_context && (
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">비즈니스 맥락</h3>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{detail.business_context}</p>
                </section>
              )}

              {/* 기대 결과 */}
              {detail.expected_result && (
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">기대 결과</h3>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap bg-green-50 rounded-lg p-3 border border-green-100">
                    {detail.expected_result}
                  </p>
                </section>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  )
}
