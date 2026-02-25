'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  getScenarios, getScenarioDetail, createScenario, updateScenario,
  deleteScenario, setScenarioRequirements, upsertScenarioResult,
  searchRequirementsForRelated, type ScenarioWithMeta, type ScenarioDetail,
} from '@/lib/queries'
import type { System, Requirement, TestStatus, ScenarioType, ScenarioStatus } from '@/lib/types'
import { getSystemColor } from '@/lib/types'
import { Plus, Sparkles, Pencil, Trash2, X, ChevronRight, Check } from 'lucide-react'

// ── 상수 ────────────────────────────────────────────────────────────────────

const SCENARIO_TYPES: { value: ScenarioType | 'all'; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'integration', label: '통합' },
  { value: 'unit', label: '단위' },
  { value: 'e2e', label: 'E2E' },
]

const TYPE_BADGE: Record<ScenarioType, string> = {
  integration: 'bg-purple-100 text-purple-700 border-purple-200',
  unit: 'bg-blue-100 text-blue-700 border-blue-200',
  e2e: 'bg-orange-100 text-orange-700 border-orange-200',
}

const TYPE_LABEL: Record<ScenarioType, string> = {
  integration: '통합',
  unit: '단위',
  e2e: 'E2E',
}

const STATUS_COLORS: Record<TestStatus, { bg: string; text: string; border: string }> = {
  'Pass':        { bg: 'bg-green-500',  text: 'text-white', border: 'border-green-500' },
  'Fail':        { bg: 'bg-red-500',    text: 'text-white', border: 'border-red-500' },
  'Block':       { bg: 'bg-gray-700',   text: 'text-white', border: 'border-gray-700' },
  'In Progress': { bg: 'bg-blue-500',   text: 'text-white', border: 'border-blue-500' },
  '미테스트':    { bg: 'bg-gray-100',   text: 'text-gray-500', border: 'border-gray-200' },
}

const TEST_STATUSES: TestStatus[] = ['Pass', 'Fail', 'Block', 'In Progress', '미테스트']

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return '방금 전'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

// ── ScenarioListItem ─────────────────────────────────────────────────────────

interface ListItemProps {
  scenario: ScenarioWithMeta
  selected: boolean
  onClick: () => void
}

function ScenarioListItem({ scenario, selected, onClick }: ListItemProps) {
  const status = scenario.result?.status ?? '미테스트'
  const sc = STATUS_COLORS[status]

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
        selected
          ? 'bg-indigo-50 border-indigo-200'
          : 'bg-white border-transparent hover:bg-gray-50 hover:border-gray-200'
      }`}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 text-[10px] px-1.5 py-0.5 rounded border font-medium ${TYPE_BADGE[scenario.scenario_type]}`}>
          {TYPE_LABEL[scenario.scenario_type]}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{scenario.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`w-2 h-2 rounded-full inline-block ${sc.bg}`} />
            <span className="text-xs text-gray-500">{status}</span>
            <span className="text-xs text-gray-400">· 요구사항 {scenario.reqCount}개</span>
            {scenario.ai_generated && (
              <span className="text-xs text-indigo-400">· AI</span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

// ── 요구사항 피커 ─────────────────────────────────────────────────────────────

type ReqSearchResult = Pick<Requirement, 'id' | 'display_id' | 'feature_name' | 'depth_0' | 'depth_1' | 'systems'>

interface RequirementPickerProps {
  selected: ReqSearchResult[]
  onChange: (reqs: ReqSearchResult[]) => void
}

function RequirementPicker({ selected, onChange }: RequirementPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ReqSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!query.trim()) { setResults([]); setOpen(false); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await searchRequirementsForRelated(query)
        setResults(data.filter(r => !selected.some(s => s.id === r.id)))
        setOpen(true)
      } finally {
        setLoading(false)
      }
    }, 250)
  }, [query, selected])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function addReq(req: ReqSearchResult) {
    onChange([...selected, req])
    setQuery('')
    setOpen(false)
  }

  function removeReq(id: string) {
    onChange(selected.filter(r => r.id !== id))
  }

  return (
    <div>
      {/* 선택된 칩 */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map(req => {
            const sysName = (req.systems as any)?.name ?? ''
            const sc = getSystemColor(sysName)
            return (
              <span key={req.id} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${sc.chip}`}>
                <span className={`text-[10px] px-1 rounded ${sc.tag}`}>{sysName}</span>
                #{req.display_id} {req.feature_name}
                <button onClick={() => removeReq(req.id)} className="ml-0.5 hover:text-red-500">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )
          })}
        </div>
      )}

      {/* 검색 입력 */}
      <div ref={containerRef} className="relative">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="기능명 또는 #번호로 검색..."
          className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
        />
        {open && (results.length > 0 || loading) && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
            {loading && <div className="px-3 py-2 text-xs text-gray-400">검색 중...</div>}
            {results.map(req => {
              const sysName = (req.systems as any)?.name ?? ''
              const sc = getSystemColor(sysName)
              const path = [req.depth_0, req.depth_1].filter(Boolean).join(' > ')
              return (
                <button
                  key={req.id}
                  onClick={() => addReq(req)}
                  className="w-full text-left px-3 py-2 hover:bg-indigo-50 flex items-center gap-2"
                >
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${sc.tag}`}>{sysName}</span>
                  <span className="text-xs text-gray-500 shrink-0">#{req.display_id}</span>
                  <span className="text-sm text-gray-800 truncate">{req.feature_name}</span>
                  {path && <span className="text-xs text-gray-400 truncate ml-auto">{path}</span>}
                </button>
              )
            })}
            {!loading && results.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-400">결과 없음</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── ScenarioEditor ────────────────────────────────────────────────────────────

interface EditorProps {
  cycleId: string
  initial?: ScenarioDetail | null
  onSaved: (id: string) => void
  onCancel: () => void
}

function ScenarioEditor({ cycleId, initial, onSaved, onCancel }: EditorProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [scenarioType, setScenarioType] = useState<ScenarioType>(initial?.scenario_type ?? 'integration')
  const [scenarioStatus, setScenarioStatus] = useState<ScenarioStatus>(initial?.status ?? 'active')
  const [businessContext, setBusinessContext] = useState(initial?.business_context ?? '')
  const [precondition, setPrecondition] = useState(initial?.precondition ?? '')
  const [steps, setSteps] = useState(initial?.steps ?? '')
  const [expectedResult, setExpectedResult] = useState(initial?.expected_result ?? '')
  const [selectedReqs, setSelectedReqs] = useState<ReqSearchResult[]>(
    (initial?.linkedRequirements ?? []).map(lr => ({
      id: lr.requirement_id,
      display_id: lr.requirement?.display_id ?? null,
      feature_name: lr.requirement?.feature_name ?? null,
      depth_0: lr.requirement?.depth_0 ?? null,
      depth_1: lr.requirement?.depth_1 ?? null,
      systems: lr.requirement?.systems,
    }))
  )
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  async function handleAiGenerate() {
    if (selectedReqs.length === 0) {
      setAiError('요구사항을 1개 이상 선택하세요')
      return
    }
    setAiLoading(true)
    setAiError('')
    try {
      const res = await fetch('/api/ai/scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirementIds: selectedReqs.map(r => r.id),
          scenarioType,
          contextHint: businessContext || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'AI 생성 실패')
      if (json.title) setTitle(json.title)
      if (json.precondition) setPrecondition(json.precondition)
      if (json.steps) setSteps(json.steps)
      if (json.expected_result) setExpectedResult(json.expected_result)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'AI 생성 실패')
    } finally {
      setAiLoading(false)
    }
  }

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    try {
      let scenarioId = initial?.id
      const payload = {
        title: title.trim(),
        scenario_type: scenarioType,
        status: scenarioStatus,
        business_context: businessContext || null,
        precondition: precondition || null,
        steps,
        expected_result: expectedResult,
        ai_generated: initial?.ai_generated ?? false,
      }

      if (scenarioId) {
        await updateScenario(scenarioId, payload)
      } else {
        const created = await createScenario(payload)
        scenarioId = created.id
      }

      await setScenarioRequirements(
        scenarioId!,
        selectedReqs.map((r, i) => ({ requirement_id: r.id, order_index: i }))
      )
      onSaved(scenarioId!)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      {/* 제목 */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">시나리오 제목 *</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="예: 공급사 상품 등록 → 관리자 승인 → 쇼핑몰 노출 통합 흐름"
          className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
        />
      </div>

      {/* 유형 + 상태 */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-500 mb-1">유형</label>
          <select
            value={scenarioType}
            onChange={e => setScenarioType(e.target.value as ScenarioType)}
            className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 bg-white"
          >
            <option value="integration">통합</option>
            <option value="unit">단위</option>
            <option value="e2e">E2E</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-500 mb-1">상태</label>
          <select
            value={scenarioStatus}
            onChange={e => setScenarioStatus(e.target.value as ScenarioStatus)}
            className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 bg-white"
          >
            <option value="active">활성</option>
            <option value="draft">초안</option>
            <option value="deprecated">폐기</option>
          </select>
        </div>
      </div>

      {/* 비즈니스 맥락 */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">비즈니스 맥락 (선택)</label>
        <textarea
          value={businessContext}
          onChange={e => setBusinessContext(e.target.value)}
          rows={2}
          placeholder="이 시나리오가 검증하는 비즈니스 목적을 간략히 설명하세요"
          className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 resize-none"
        />
      </div>

      {/* 요구사항 연결 */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">연결된 요구사항</label>
        <RequirementPicker selected={selectedReqs} onChange={setSelectedReqs} />
      </div>

      {/* AI 생성 */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleAiGenerate}
          disabled={aiLoading || selectedReqs.length === 0}
          className="gap-1.5 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {aiLoading ? 'AI 생성 중...' : 'AI 자동 생성'}
        </Button>
        <span className="text-xs text-gray-400">선택한 요구사항 기반으로 단계/기대결과 자동 작성</span>
      </div>
      {aiError && <p className="text-xs text-red-500 -mt-2">{aiError}</p>}

      {/* 사전 조건 */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">사전 조건</label>
        <textarea
          value={precondition}
          onChange={e => setPrecondition(e.target.value)}
          rows={3}
          placeholder="테스트 환경, 계정 상태, 데이터 준비 등"
          className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 resize-none"
        />
      </div>

      {/* 테스트 단계 */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">테스트 단계 *</label>
        <textarea
          value={steps}
          onChange={e => setSteps(e.target.value)}
          rows={6}
          placeholder={`1. 공급사 계정으로 로그인 — 로그인 성공\n2. 상품 등록 페이지 진입 — 등록 폼 노출\n3. ...`}
          className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 resize-none font-mono"
        />
      </div>

      {/* 기대 결과 */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">기대 결과 *</label>
        <textarea
          value={expectedResult}
          onChange={e => setExpectedResult(e.target.value)}
          rows={3}
          placeholder="시나리오 전체가 성공했을 때의 최종 상태"
          className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 resize-none"
        />
      </div>

      {/* 버튼 */}
      <div className="flex gap-2 pt-2 pb-4">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || !title.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          {saving ? '저장 중...' : initial ? '수정 저장' : '시나리오 생성'}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          취소
        </Button>
      </div>
    </div>
  )
}

// ── ScenarioDetail ────────────────────────────────────────────────────────────

interface DetailProps {
  detail: ScenarioDetail
  cycleId: string
  onEdit: () => void
  onDelete: () => void
  onRefresh: () => void
  onSelectRequirement: (req: Requirement & { currentResult?: undefined }) => void
}

function ScenarioDetailView({ detail, cycleId, onEdit, onDelete, onRefresh, onSelectRequirement }: DetailProps) {
  const [resultStatus, setResultStatus] = useState<TestStatus>(detail.result?.status ?? '미테스트')
  const [tester, setTester] = useState(detail.result?.tester ?? '')
  const [note, setNote] = useState(detail.result?.note ?? '')
  const [savingResult, setSavingResult] = useState(false)
  const [resultSaved, setResultSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleStatusClick(status: TestStatus) {
    const prev = resultStatus
    setResultStatus(status)
    try {
      await upsertScenarioResult({
        scenario_id: detail.id,
        cycle_id: cycleId,
        status,
        tester: tester || undefined,
        note: note || undefined,
      })
      onRefresh()
    } catch {
      setResultStatus(prev)
    }
  }

  async function handleSaveResult() {
    setSavingResult(true)
    try {
      await upsertScenarioResult({
        scenario_id: detail.id,
        cycle_id: cycleId,
        status: resultStatus,
        tester: tester || undefined,
        note: note || undefined,
      })
      setResultSaved(true)
      setTimeout(() => setResultSaved(false), 2500)
      onRefresh()
    } catch (e) {
      console.error(e)
    } finally {
      setSavingResult(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`"${detail.title}" 시나리오를 삭제하시겠습니까?`)) return
    setDeleting(true)
    try {
      await deleteScenario(detail.id)
      onDelete()
    } finally {
      setDeleting(false)
    }
  }

  const statusBadgeStyle: Record<ScenarioStatus, string> = {
    active: 'bg-green-100 text-green-700 border-green-200',
    draft: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    deprecated: 'bg-gray-100 text-gray-500 border-gray-200',
  }
  const statusLabel: Record<ScenarioStatus, string> = { active: '활성', draft: '초안', deprecated: '폐기' }

  return (
    <div className="flex flex-col gap-5 p-4 h-full overflow-y-auto">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${TYPE_BADGE[detail.scenario_type]}`}>
              {TYPE_LABEL[detail.scenario_type]}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded border ${statusBadgeStyle[detail.status]}`}>
              {statusLabel[detail.status]}
            </span>
            {detail.ai_generated && (
              <span className="text-xs px-1.5 py-0.5 rounded border bg-indigo-50 text-indigo-600 border-indigo-200 flex items-center gap-1">
                <Sparkles className="h-3 w-3" />AI 생성
              </span>
            )}
          </div>
          <h2 className="text-base font-semibold text-gray-900">{detail.title}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{timeAgo(detail.updated_at)} 수정</p>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button size="sm" variant="outline" onClick={onEdit} className="h-7 px-2">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={handleDelete} disabled={deleting}
            className="h-7 px-2 text-red-500 hover:text-red-600 hover:border-red-300">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* 비즈니스 맥락 */}
      {detail.business_context && (
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">비즈니스 맥락</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{detail.business_context}</p>
        </section>
      )}

      {/* 사전 조건 */}
      {detail.precondition && (
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">사전 조건</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 border border-gray-100">
            {detail.precondition}
          </p>
        </section>
      )}

      {/* 테스트 단계 */}
      {detail.steps && (
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">테스트 단계</h3>
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans bg-gray-50 rounded-lg p-3 border border-gray-100">
            {detail.steps}
          </pre>
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

      {/* 연결된 요구사항 */}
      {detail.linkedRequirements.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            연결된 요구사항 ({detail.linkedRequirements.length})
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {detail.linkedRequirements.map(lr => {
              const sysName = (lr.requirement?.systems as any)?.name ?? ''
              const sc = getSystemColor(sysName)
              return (
                <button
                  key={lr.id}
                  onClick={() => lr.requirement && onSelectRequirement(lr.requirement as any)}
                  className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border cursor-pointer hover:opacity-80 transition-opacity ${sc.chip}`}
                >
                  <span className={`text-[10px] px-1 rounded ${sc.tag}`}>{sysName}</span>
                  #{lr.requirement?.display_id} {lr.requirement?.feature_name}
                  <ChevronRight className="h-3 w-3" />
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* 테스트 결과 */}
      <section className="border-t border-gray-100 pt-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">테스트 결과</h3>

        {/* 상태 버튼 */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {TEST_STATUSES.map(s => {
            const sc = STATUS_COLORS[s]
            const active = resultStatus === s
            return (
              <button
                key={s}
                onClick={() => handleStatusClick(s)}
                className={`text-xs px-2.5 py-1 rounded-md border font-medium transition-colors ${
                  active ? `${sc.bg} ${sc.text} ${sc.border}` : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {s}
              </button>
            )
          })}
        </div>

        {/* 테스터 + 노트 */}
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={tester}
            onChange={e => setTester(e.target.value)}
            placeholder="테스터명"
            className="text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
          />
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            placeholder="테스트 메모 (선택)"
            className="text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 resize-none"
          />
          <Button
            size="sm"
            onClick={handleSaveResult}
            disabled={savingResult}
            className={`w-fit ${resultSaved ? 'bg-green-600 hover:bg-green-600' : 'bg-indigo-600 hover:bg-indigo-700'} text-white`}
          >
            {resultSaved ? <><Check className="h-3.5 w-3.5 mr-1" />저장됨</> : '결과 저장'}
          </Button>
        </div>
      </section>
    </div>
  )
}

// ── ScenarioTab (메인) ────────────────────────────────────────────────────────

interface ScenarioTabProps {
  cycleId: string
  systems: System[]
  onSelectRequirement: (req: Requirement & { currentResult?: undefined }) => void
  refreshKey: number
}

export function ScenarioTab({ cycleId, onSelectRequirement, refreshKey }: ScenarioTabProps) {
  const [scenarios, setScenarios] = useState<ScenarioWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ScenarioDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [mode, setMode] = useState<'view' | 'create' | 'edit'>('view')

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getScenarios(cycleId, {
        scenarioType: typeFilter !== 'all' ? typeFilter : undefined,
        search: search || undefined,
      })
      setScenarios(data)
    } finally {
      setLoading(false)
    }
  }, [cycleId, typeFilter, search, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadList() }, [loadList])

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    try {
      const d = await getScenarioDetail(id, cycleId)
      setDetail(d)
    } finally {
      setDetailLoading(false)
    }
  }, [cycleId])

  useEffect(() => {
    if (selectedId) loadDetail(selectedId)
    else setDetail(null)
  }, [selectedId, loadDetail])

  function handleSelect(id: string) {
    setSelectedId(id)
    setMode('view')
  }

  function handleCreate() {
    setSelectedId(null)
    setDetail(null)
    setMode('create')
  }

  async function handleSaved(id: string) {
    await loadList()
    setSelectedId(id)
    setMode('view')
    await loadDetail(id)
  }

  function handleDelete() {
    setSelectedId(null)
    setDetail(null)
    setMode('view')
    loadList()
  }

  const showEditor = mode === 'create' || mode === 'edit'

  return (
    <div className="flex gap-4 h-[calc(100vh-160px)]">
      {/* 좌측 목록 패널 */}
      <div className="w-72 shrink-0 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* 타입 필터 탭 */}
        <div className="flex border-b border-gray-100 px-2 pt-2 gap-0.5">
          {SCENARIO_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => setTypeFilter(t.value)}
              className={`text-xs px-2 py-1 rounded-t transition-colors font-medium ${
                typeFilter === t.value
                  ? 'bg-indigo-50 text-indigo-700 border border-b-white border-indigo-200'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 검색 + 새 시나리오 */}
        <div className="flex gap-1.5 p-2 border-b border-gray-100">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="제목 검색..."
            className="flex-1 text-xs border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-300"
          />
          <Button size="sm" onClick={handleCreate} className="h-7 px-2 bg-indigo-600 hover:bg-indigo-700 text-white shrink-0">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* 목록 */}
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
          {loading ? (
            <div className="text-xs text-gray-400 text-center mt-8">불러오는 중...</div>
          ) : scenarios.length === 0 ? (
            <div className="text-xs text-gray-400 text-center mt-8">
              시나리오가 없습니다.<br />
              <button onClick={handleCreate} className="text-indigo-500 hover:underline mt-1">새 시나리오 만들기</button>
            </div>
          ) : (
            scenarios.map(sc => (
              <ScenarioListItem
                key={sc.id}
                scenario={sc}
                selected={selectedId === sc.id}
                onClick={() => handleSelect(sc.id)}
              />
            ))
          )}
        </div>

        {/* 통계 푸터 */}
        <div className="border-t border-gray-100 px-3 py-2">
          <p className="text-xs text-gray-400">총 {scenarios.length}개 시나리오</p>
        </div>
      </div>

      {/* 우측 상세/편집 패널 */}
      <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden">
        {showEditor ? (
          <ScenarioEditor
            cycleId={cycleId}
            initial={mode === 'edit' ? detail : null}
            onSaved={handleSaved}
            onCancel={() => {
              setMode(selectedId ? 'view' : 'view')
            }}
          />
        ) : detailLoading ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-400">불러오는 중...</div>
        ) : detail ? (
          <ScenarioDetailView
            detail={detail}
            cycleId={cycleId}
            onEdit={() => setMode('edit')}
            onDelete={handleDelete}
            onRefresh={() => { loadList(); loadDetail(detail.id) }}
            onSelectRequirement={onSelectRequirement}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
            <p className="text-sm">시나리오를 선택하거나 새로 만드세요</p>
            <Button size="sm" onClick={handleCreate} variant="outline" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              새 시나리오
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
