'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  getScenarios, getScenarioDetail, createScenario, updateScenario,
  deleteScenario, setScenarioRequirements, upsertScenarioResult,
  searchRequirementsForRelated, getE2EScenariosForPicker,
  setScenarioCompositions, setScenarioCompositionsFromParent,
  searchScenarios,
  type ScenarioWithMeta, type ScenarioDetail,
} from '@/lib/queries'
import type { System, Requirement, TestStatus, ScenarioType, ScenarioStatus, IssueItem, Severity } from '@/lib/types'
import { getSystemColor, SEVERITY_STYLE } from '@/lib/types'
import { Plus, Sparkles, Pencil, Trash2, X, ChevronRight, ChevronLeft, Check, ArrowUp, ArrowDown, Search } from 'lucide-react'

// ── URL 자동 링크 렌더러 ──────────────────────────────────────────────────────
function AutoLink({ text }: { text: string }) {
  const urlRegex = /https?:\/\/[^\s<>"']+/g
  const parts: Array<{ type: 'text' | 'url'; value: string }> = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    parts.push({ type: 'url', value: match[0] })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push({ type: 'text', value: text.slice(lastIndex) })
  return (
    <>
      {parts.map((p, i) =>
        p.type === 'url' ? (
          <a key={i} href={p.value} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-blue-600 hover:underline break-all">
            {p.value}
          </a>
        ) : (
          <span key={i}>{p.value}</span>
        )
      )}
    </>
  )
}

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

// ①-⑳ 커버, 그 이후 숫자 문자열
function toOrdinal(n: number): string {
  const symbols = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳']
  return n < symbols.length ? symbols[n] : String(n + 1)
}

// ── ScenarioListItem ─────────────────────────────────────────────────────────

interface ListItemProps {
  scenario: ScenarioWithMeta
  selected: boolean
  onClick: () => void
  checked?: boolean
  onCheck?: (checked: boolean) => void
  hideTypeBadge?: boolean
  systemNames?: string[]
}

function ScenarioListItem({ scenario, selected, onClick, checked, onCheck, hideTypeBadge, systemNames }: ListItemProps) {
  const status = scenario.result?.status ?? '미테스트'
  const hasE2Es = scenario.scenario_type === 'integration' && (scenario.parentE2Es?.length ?? 0) > 0
  const hasChildren = scenario.scenario_type === 'e2e' && (scenario.childCount ?? 0) > 0

  const dotColor =
    status === 'Pass'        ? 'bg-green-400' :
    status === 'Fail'        ? 'bg-red-400' :
    status === 'Block'       ? 'bg-gray-500' :
    status === 'In Progress' ? 'bg-blue-400' :
                               'bg-gray-300'

  const metaParts: string[] = []
  if (scenario.reqCount > 0) metaParts.push(`요구사항 ${scenario.reqCount}개`)
  if (hasChildren) metaParts.push(`통합 ${scenario.childCount}개`)
  if (hasE2Es) metaParts.push(`E2E ${scenario.parentE2Es!.length}개`)
  if (scenario.ai_generated) metaParts.push('AI')

  return (
    <div className="flex items-center gap-1.5">
      {onCheck !== undefined && (
        <div className="shrink-0 pl-1" onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={checked ?? false}
            onChange={e => onCheck(e.target.checked)}
            className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer"
          />
        </div>
      )}
      <button
        onClick={onClick}
        className={`flex-1 min-w-0 text-left px-2.5 py-1.5 rounded-md transition-colors ${
          selected ? 'bg-indigo-50' : 'hover:bg-gray-50'
        }`}
      >
        {!hideTypeBadge && (
          <div className="mb-0.5">
            <span className={`text-[9px] px-1 py-px rounded border font-medium ${TYPE_BADGE[scenario.scenario_type]}`}>
              {TYPE_LABEL[scenario.scenario_type]}
            </span>
          </div>
        )}
        <p className="text-xs font-medium text-gray-800 truncate leading-snug">{scenario.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
          {metaParts.length > 0 && (
            <span className="text-[10px] text-gray-400">{metaParts.join(' · ')}</span>
          )}
          {systemNames && systemNames.length > 0 && (
            <div className="flex gap-0.5">
              {systemNames.map(name => {
                const sc = getSystemColor(name)
                return (
                  <span key={name} className={`text-[9px] px-1 py-px rounded border font-medium ${sc.tag}`}>
                    {name}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      </button>
    </div>
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

  return (
    <div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map(req => {
            const sysName = (req.systems as any)?.name ?? ''
            const sc = getSystemColor(sysName)
            return (
              <span key={req.id} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${sc.chip}`}>
                <span className={`text-[10px] px-1 rounded ${sc.tag}`}>{sysName}</span>
                #{req.display_id} {req.feature_name}
                <button onClick={() => onChange(selected.filter(r => r.id !== req.id))} className="ml-0.5 hover:text-red-500">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )
          })}
        </div>
      )}
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
                  onClick={() => { onChange([...selected, req]); setQuery(''); setOpen(false) }}
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

// ── 통합 시나리오 피커 (E2E 편집용) ──────────────────────────────────────────

interface ScenarioPickerItem { id: string; title: string }

interface ScenarioPickerProps {
  selected: ScenarioPickerItem[]
  onChange: (items: ScenarioPickerItem[]) => void
  excludeId?: string
}

function ScenarioPicker({ selected, onChange, excludeId }: ScenarioPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ScenarioPickerItem[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await searchScenarios(query, 'integration')
        setResults(data.filter(r => !selected.some(s => s.id === r.id) && r.id !== excludeId))
      } finally {
        setLoading(false)
      }
    }, 200)
  }, [query, selected, excludeId])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function moveItem(idx: number, dir: -1 | 1) {
    const target = idx + dir
    if (target < 0 || target >= selected.length) return
    const next = [...selected]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    onChange(next)
  }

  function moveToPosition(fromIdx: number, toPos: number) {
    const target = Math.max(0, Math.min(selected.length - 1, toPos - 1))
    if (target === fromIdx) return
    const next = [...selected]
    const [item] = next.splice(fromIdx, 1)
    next.splice(target, 0, item)
    onChange(next)
  }

  function removeItem(idx: number) {
    onChange(selected.filter((_, i) => i !== idx))
  }

  return (
    <div>
      {/* 선택된 항목 — 순서 조정 가능 */}
      {selected.length > 0 && (
        <div className="flex flex-col gap-1 mb-2">
          {selected.map((item, idx) => (
            <div key={item.id} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2.5 py-2">
              <span className="text-sm text-gray-400 w-5 text-center shrink-0">{toOrdinal(idx)}</span>
              <span className="flex-1 text-sm text-gray-800 truncate">{item.title}</span>
              <div className="flex items-center gap-0.5 shrink-0">
                <label className="text-[10px] text-gray-400 mr-0.5">순서</label>
                <input
                  type="number"
                  min={1}
                  max={selected.length}
                  key={`${item.id}-${idx}`}
                  defaultValue={idx + 1}
                  onBlur={e => {
                    const val = parseInt(e.target.value)
                    if (!isNaN(val) && val >= 1 && val <= selected.length && val !== idx + 1) {
                      moveToPosition(idx, val)
                    }
                  }}
                  className="w-12 text-xs text-center border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                />
                <button onClick={() => moveItem(idx, -1)} disabled={idx === 0}
                  className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed">
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button onClick={() => moveItem(idx, 1)} disabled={idx === selected.length - 1}
                  className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed">
                  <ArrowDown className="h-3 w-3" />
                </button>
                <button onClick={() => removeItem(idx)} className="p-0.5 text-gray-300 hover:text-red-400 ml-0.5">
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 검색 입력 */}
      <div ref={containerRef} className="relative">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="통합 시나리오 제목 검색..."
          className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
        />
        {open && (results.length > 0 || loading) && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
            {loading && <div className="px-3 py-2 text-xs text-gray-400">검색 중...</div>}
            {results.map(item => (
              <button
                key={item.id}
                onClick={() => { onChange([...selected, item]); setQuery(''); setOpen(false) }}
                className="w-full text-left px-3 py-2 hover:bg-indigo-50 flex items-center gap-2"
              >
                <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${TYPE_BADGE.integration}`}>통합</span>
                <span className="text-sm text-gray-800 truncate">{item.title}</span>
              </button>
            ))}
            {!loading && results.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-400">통합 시나리오 없음</div>
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
  systems: System[]
  initial?: ScenarioDetail | null
  onSaved: (id: string) => void
  onCancel: () => void
}

function ScenarioEditor({ cycleId, systems, initial, onSaved, onCancel }: EditorProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [scenarioType, setScenarioType] = useState<ScenarioType>(initial?.scenario_type ?? 'integration')
  const [scenarioStatus, setScenarioStatus] = useState<ScenarioStatus>(initial?.status ?? 'active')
  const [selectedSystemIds, setSelectedSystemIds] = useState<string[]>(initial?.system_ids ?? [])
  const [businessContext, setBusinessContext] = useState(initial?.business_context ?? '')
  const [precondition, setPrecondition] = useState(initial?.precondition ?? '')
  const [steps, setSteps] = useState(initial?.steps ?? '')
  const [expectedResult, setExpectedResult] = useState(initial?.expected_result ?? '')

  // 통합/단위 — 연결된 요구사항
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

  // 통합 — 상위 E2E 연결
  const [composedE2Es, setComposedE2Es] = useState<{ e2eId: string; orderIndex: number }[]>(
    (initial?.parentE2Es ?? []).map(e => ({ e2eId: e.id, orderIndex: e.orderIndex }))
  )
  const [e2eOptions, setE2eOptions] = useState<{ id: string; title: string }[]>([])

  // E2E — 구성 통합 시나리오
  const [selectedIntegrations, setSelectedIntegrations] = useState<ScenarioPickerItem[]>(
    (initial?.childScenarios ?? [])
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(c => ({ id: c.id, title: c.title }))
  )

  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  useEffect(() => {
    if (scenarioType === 'integration') {
      getE2EScenariosForPicker().then(setE2eOptions).catch(console.error)
    }
  }, [scenarioType])

  async function handleAiGenerate() {
    if (selectedReqs.length === 0) { setAiError('요구사항을 1개 이상 선택하세요'); return }
    setAiLoading(true); setAiError('')
    try {
      const res = await fetch('/api/ai/scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requirementIds: selectedReqs.map(r => r.id), scenarioType, contextHint: businessContext || undefined }),
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
        system_ids: selectedSystemIds,
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

      if (scenarioType !== 'e2e') {
        await setScenarioRequirements(
          scenarioId!,
          selectedReqs.map((r, i) => ({ requirement_id: r.id, order_index: i }))
        )
      }
      if (scenarioType === 'integration') {
        await setScenarioCompositions(
          scenarioId!,
          composedE2Es.map(e => ({ parent_id: e.e2eId, order_index: e.orderIndex }))
        )
      }
      if (scenarioType === 'e2e') {
        await setScenarioCompositionsFromParent(
          scenarioId!,
          selectedIntegrations.map((item, i) => ({ child_id: item.id, order_index: i }))
        )
      }

      onSaved(scenarioId!)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const isE2E = scenarioType === 'e2e'

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      {/* 제목 */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">시나리오 제목 *</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={isE2E ? '예: 공급사 상품 등록 → 관리자 승인 → 쇼핑몰 노출 전체 흐름' : '예: 공급사 상품 등록 → 관리자 승인 통합 흐름'}
          className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
        />
      </div>

      {/* 유형 + 상태 */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-500 mb-1">유형</label>
          <select value={scenarioType} onChange={e => setScenarioType(e.target.value as ScenarioType)}
            className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 bg-white">
            <option value="integration">통합</option>
            <option value="unit">단위</option>
            <option value="e2e">E2E</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-500 mb-1">상태</label>
          <select value={scenarioStatus} onChange={e => setScenarioStatus(e.target.value as ScenarioStatus)}
            className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 bg-white">
            <option value="active">활성</option>
            <option value="draft">초안</option>
            <option value="deprecated">폐기</option>
          </select>
        </div>
      </div>

      {/* 시스템 */}
      {systems.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">시스템</label>
          <div className="flex flex-wrap gap-1.5">
            {systems.map(sys => {
              const active = selectedSystemIds.includes(sys.id)
              const sc = getSystemColor(sys.name)
              return (
                <button
                  key={sys.id}
                  type="button"
                  onClick={() => setSelectedSystemIds(prev =>
                    active ? prev.filter(id => id !== sys.id) : [...prev, sys.id]
                  )}
                  className={`text-xs px-2.5 py-1 rounded-md border font-medium transition-colors ${
                    active ? sc.buttonActive : sc.buttonBase
                  }`}
                >
                  {sys.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* E2E: 구성 통합 시나리오 섹션 */}
      {isE2E && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            구성 통합 시나리오
            {selectedIntegrations.length > 0 && (
              <span className="ml-1 text-orange-500">({selectedIntegrations.length}개)</span>
            )}
          </label>
          <div className="border border-gray-200 rounded-lg p-2 bg-gray-50">
            <ScenarioPicker
              selected={selectedIntegrations}
              onChange={setSelectedIntegrations}
              excludeId={initial?.id}
            />
          </div>
        </div>
      )}

      {/* 통합: 상위 E2E 시나리오 */}
      {scenarioType === 'integration' && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">상위 E2E 시나리오</label>
          {e2eOptions.length === 0 ? (
            <p className="text-xs text-gray-400 py-1">활성 E2E 시나리오가 없습니다.</p>
          ) : (
            <div className="space-y-1 border border-gray-200 rounded-md p-2 bg-gray-50">
              {e2eOptions.map(e2e => {
                const existing = composedE2Es.find(c => c.e2eId === e2e.id)
                const isSelected = !!existing
                return (
                  <div key={e2e.id} className="flex items-center gap-2 py-0.5">
                    <input type="checkbox" checked={isSelected}
                      onChange={ev => {
                        if (ev.target.checked) setComposedE2Es([...composedE2Es, { e2eId: e2e.id, orderIndex: 0 }])
                        else setComposedE2Es(composedE2Es.filter(c => c.e2eId !== e2e.id))
                      }}
                      className="w-3.5 h-3.5 accent-indigo-600 shrink-0"
                    />
                    <span className="text-sm text-gray-700 flex-1 truncate">{e2e.title}</span>
                    {isSelected && (
                      <div className="flex items-center gap-1 shrink-0">
                        <label className="text-xs text-gray-400">순서</label>
                        <input type="number" min={1} value={existing!.orderIndex + 1}
                          onChange={ev => {
                            const val = parseInt(ev.target.value) - 1
                            if (isNaN(val) || val < 0) return
                            setComposedE2Es(composedE2Es.map(c => c.e2eId === e2e.id ? { ...c, orderIndex: val } : c))
                          }}
                          className="w-14 text-xs border border-gray-200 rounded px-2 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* 비즈니스 맥락 */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">비즈니스 맥락 (선택)</label>
        <textarea value={businessContext} onChange={e => setBusinessContext(e.target.value)} rows={2}
          placeholder="이 시나리오가 검증하는 비즈니스 목적"
          className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 resize-none" />
      </div>

      {/* 통합/단위: 연결된 요구사항 + AI */}
      {!isE2E && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">연결된 요구사항</label>
            <RequirementPicker selected={selectedReqs} onChange={setSelectedReqs} />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleAiGenerate}
              disabled={aiLoading || selectedReqs.length === 0}
              className="gap-1.5 text-indigo-600 border-indigo-200 hover:bg-indigo-50">
              <Sparkles className="h-3.5 w-3.5" />
              {aiLoading ? 'AI 생성 중...' : 'AI 자동 생성'}
            </Button>
            <span className="text-xs text-gray-400">선택한 요구사항 기반으로 단계/기대결과 자동 작성</span>
          </div>
          {aiError && <p className="text-xs text-red-500 -mt-2">{aiError}</p>}
        </>
      )}

      {/* 사전 조건 */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">사전 조건</label>
        <textarea value={precondition} onChange={e => setPrecondition(e.target.value)} rows={3}
          placeholder="테스트 환경, 계정 상태, 데이터 준비 등"
          className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 resize-none" />
      </div>

      {/* 테스트 단계 */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          테스트 단계{!isE2E && ' *'}
        </label>
        <textarea value={steps} onChange={e => setSteps(e.target.value)} rows={isE2E ? 3 : 6}
          placeholder={isE2E ? '전체 E2E 흐름 개요 (선택)' : `1. 공급사 계정으로 로그인 — 로그인 성공\n2. 상품 등록 페이지 진입 — 등록 폼 노출\n3. ...`}
          className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 resize-none font-mono" />
      </div>

      {/* 기대 결과 */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          기대 결과{!isE2E && ' *'}
        </label>
        <textarea value={expectedResult} onChange={e => setExpectedResult(e.target.value)} rows={3}
          placeholder="시나리오 전체가 성공했을 때의 최종 상태"
          className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 resize-none" />
      </div>

      {/* 버튼 */}
      <div className="flex gap-2 pt-2 pb-4">
        <Button size="sm" onClick={handleSave} disabled={saving || !title.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white">
          {saving ? '저장 중...' : initial ? '수정 저장' : '시나리오 생성'}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>취소</Button>
      </div>
    </div>
  )
}

// ── ScenarioDetailView ────────────────────────────────────────────────────────

interface DetailProps {
  detail: ScenarioDetail
  cycleId: string
  onEdit: () => void
  onDelete: () => void
  onRefresh: () => void
  onSelectRequirement: (req: Requirement & { currentResult?: undefined }) => void
  onSelectScenario: (id: string) => void
  onGoBack?: () => void
}

function ScenarioDetailView({ detail, cycleId, onEdit, onDelete, onRefresh, onSelectRequirement, onSelectScenario, onGoBack }: DetailProps) {
  const [resultStatus, setResultStatus] = useState<TestStatus>(detail.result?.status ?? '미테스트')
  const [tester, setTester] = useState(detail.result?.tester ?? '')
  const [note, setNote] = useState(detail.result?.note ?? '')
  const [issueItems, setIssueItems] = useState<IssueItem[]>(detail.result?.issue_items ?? [])
  const [editingIssueIdx, setEditingIssueIdx] = useState<number | null>(null)
  const [savingResult, setSavingResult] = useState(false)
  const [resultSaved, setResultSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // E2E 자식 순서 편집
  const childScenarios = detail.childScenarios ?? []
  const [localChildren, setLocalChildren] = useState(childScenarios)
  const [childOrderEditing, setChildOrderEditing] = useState(false)
  const [savingChildOrder, setSavingChildOrder] = useState(false)

  useEffect(() => {
    setLocalChildren([...(detail.childScenarios ?? [])])
    setChildOrderEditing(false)
  }, [detail.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function moveChild(idx: number, dir: -1 | 1) {
    const target = idx + dir
    if (target < 0 || target >= localChildren.length) return
    const next = [...localChildren]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setLocalChildren(next)
  }

  function moveChildToPosition(fromIdx: number, toPos: number) {
    const target = Math.max(0, Math.min(localChildren.length - 1, toPos - 1))
    if (target === fromIdx) return
    const next = [...localChildren]
    const [item] = next.splice(fromIdx, 1)
    next.splice(target, 0, item)
    setLocalChildren(next)
  }

  async function saveChildOrder() {
    setSavingChildOrder(true)
    try {
      await setScenarioCompositionsFromParent(
        detail.id,
        localChildren.map((c, i) => ({ child_id: c.id, order_index: i }))
      )
      setChildOrderEditing(false)
      onRefresh()
    } finally {
      setSavingChildOrder(false)
    }
  }

  async function handleStatusClick(status: TestStatus) {
    const prev = resultStatus
    setResultStatus(status)
    try {
      await upsertScenarioResult({ scenario_id: detail.id, cycle_id: cycleId, status, tester: tester || undefined, note: note || undefined, issue_items: issueItems })
      onRefresh()
    } catch { setResultStatus(prev) }
  }

  async function handleSaveResult() {
    setSavingResult(true)
    try {
      await upsertScenarioResult({ scenario_id: detail.id, cycle_id: cycleId, status: resultStatus, tester: tester || undefined, note: note || undefined, issue_items: issueItems })
      setResultSaved(true)
      setTimeout(() => setResultSaved(false), 2500)
      onRefresh()
    } catch (e) { console.error(e) }
    finally { setSavingResult(false) }
  }

  async function handleDelete() {
    if (!confirm(`"${detail.title}" 시나리오를 삭제하시겠습니까?`)) return
    setDeleting(true)
    try { await deleteScenario(detail.id); onDelete() }
    finally { setDeleting(false) }
  }

  const statusBadgeStyle: Record<ScenarioStatus, string> = {
    active: 'bg-green-100 text-green-700 border-green-200',
    draft: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    deprecated: 'bg-gray-100 text-gray-500 border-gray-200',
  }
  const statusLabel: Record<ScenarioStatus, string> = { active: '활성', draft: '초안', deprecated: '폐기' }
  const parentE2Es = detail.parentE2Es ?? []

  return (
    <div className="flex flex-col gap-5 p-4 h-full overflow-y-auto">
      {/* 뒤로가기 */}
      {onGoBack && (
        <button onClick={onGoBack}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 -mb-3 self-start transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" />
          뒤로
        </button>
      )}

      {/* 헤더 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${TYPE_BADGE[detail.scenario_type]}`}>
              {TYPE_LABEL[detail.scenario_type]}
            </span>
            {/* 통합: 상위 E2E 뱃지 */}
            {detail.scenario_type === 'integration' && parentE2Es.map(e2e => (
              <button key={e2e.id} onClick={() => onSelectScenario(e2e.id)}
                className="text-xs px-1.5 py-0.5 rounded border bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100 transition-colors flex items-center gap-1"
                title={`E2E: ${e2e.title}`}>
                <span className="max-w-[120px] truncate">{e2e.title}</span>
                <span>{toOrdinal(e2e.orderIndex)}</span>
              </button>
            ))}
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
          <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 border border-gray-100">{detail.precondition}</p>
        </section>
      )}

      {/* 테스트 단계 */}
      {detail.steps && (
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">테스트 단계</h3>
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans bg-gray-50 rounded-lg p-3 border border-gray-100">{detail.steps}</pre>
        </section>
      )}

      {/* 기대 결과 */}
      {detail.expected_result && (
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">기대 결과</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap bg-green-50 rounded-lg p-3 border border-green-100">{detail.expected_result}</p>
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
                <button key={lr.id}
                  onClick={() => lr.requirement && onSelectRequirement(lr.requirement as any)}
                  className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border cursor-pointer hover:opacity-80 transition-opacity ${sc.chip}`}>
                  <span className={`text-[10px] px-1 rounded ${sc.tag}`}>{sysName}</span>
                  #{lr.requirement?.display_id} {lr.requirement?.feature_name}
                  <ChevronRight className="h-3 w-3" />
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* E2E: 구성 통합 시나리오 */}
      {detail.scenario_type === 'e2e' && localChildren.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-1.5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              구성 통합 시나리오 ({localChildren.length}개)
            </h3>
            {!childOrderEditing ? (
              <button onClick={() => setChildOrderEditing(true)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded px-2 py-0.5 hover:border-gray-400 transition-colors">
                <ArrowUp className="h-3 w-3" />순서 편집
              </button>
            ) : (
              <div className="flex gap-1">
                <button onClick={() => { setLocalChildren([...(detail.childScenarios ?? [])]); setChildOrderEditing(false) }}
                  className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-0.5">
                  취소
                </button>
                <button onClick={saveChildOrder} disabled={savingChildOrder}
                  className="text-xs text-white bg-indigo-600 hover:bg-indigo-700 rounded px-2 py-0.5 disabled:opacity-50">
                  {savingChildOrder ? '저장 중...' : '저장'}
                </button>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1">
            {localChildren.map((child, idx) => {
              const cStatus = child.result?.status ?? '미테스트'
              const cSc = STATUS_COLORS[cStatus]
              return (
                <div key={child.id}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors ${
                    childOrderEditing ? 'border-gray-200 bg-gray-50' : 'border-gray-100 hover:border-indigo-200 hover:bg-indigo-50 cursor-pointer group'
                  }`}
                  onClick={!childOrderEditing ? () => onSelectScenario(child.id) : undefined}
                >
                  <span className="text-sm text-gray-400 shrink-0 w-5 text-center">{toOrdinal(idx)}</span>
                  <span className="flex-1 text-sm text-gray-800 truncate">{child.title}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border-0 font-medium shrink-0 ${
                    cStatus === '미테스트' ? 'bg-gray-100 text-gray-500' : `${cSc.bg} ${cSc.text}`
                  }`}>
                    {cStatus}
                  </span>
                  {childOrderEditing ? (
                    <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                      <input
                        type="number" min={1} max={localChildren.length}
                        key={`${child.id}-${idx}`} defaultValue={idx + 1}
                        onBlur={e => {
                          const val = parseInt(e.target.value)
                          if (!isNaN(val) && val >= 1 && val <= localChildren.length && val !== idx + 1) {
                            moveChildToPosition(idx, val)
                          }
                        }}
                        className="w-12 text-xs text-center border border-gray-200 rounded px-1 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                      />
                      <button onClick={() => moveChild(idx, -1)} disabled={idx === 0}
                        className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30">
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => moveChild(idx, 1)} disabled={idx === localChildren.length - 1}
                        className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30">
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-gray-400 group-hover:text-indigo-500 shrink-0" />
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 테스트 결과 */}
      <section className="border-t border-gray-100 pt-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">테스트 결과</h3>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {TEST_STATUSES.map(s => {
            const sc = STATUS_COLORS[s]
            const active = resultStatus === s
            return (
              <button key={s} onClick={() => handleStatusClick(s)}
                className={`text-xs px-2.5 py-1 rounded-md border font-medium transition-colors ${
                  active ? `${sc.bg} ${sc.text} ${sc.border}` : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}>
                {s}
              </button>
            )
          })}
        </div>

        <div className="flex flex-col gap-2">
          <input type="text" value={tester} onChange={e => setTester(e.target.value)} placeholder="테스터명"
            className="text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="테스트 메모 (선택)"
            className="text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 resize-none" />
        </div>

        {/* 이슈 관리 */}
        <div className="mt-1 border rounded-lg p-3 space-y-2 bg-gray-50 border-gray-200">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">이슈 관리</h4>
          <div className="space-y-1.5">
            {issueItems.map((item, idx) => {
              const leftBorder =
                item.severity === '크리티컬' ? 'border-l-red-500' :
                item.severity === '하이'     ? 'border-l-orange-500' :
                item.severity === '미디엄'   ? 'border-l-yellow-400' :
                item.severity === '로우'     ? 'border-l-blue-400' :
                'border-l-gray-300'
              return (
                <div key={idx} className={`bg-white rounded-lg overflow-hidden border border-gray-200 border-l-4 ${leftBorder}`}>
                  <div className="flex items-start gap-2 px-3 py-2.5">
                    {editingIssueIdx === idx ? (
                      <textarea value={item.text}
                        onChange={e => { const next = [...issueItems]; next[idx] = { ...next[idx], text: e.target.value }; setIssueItems(next) }}
                        onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` }}
                        onBlur={() => setEditingIssueIdx(null)} autoFocus rows={1} placeholder="이슈 내용 입력"
                        className="flex-1 text-sm border-none outline-none bg-transparent placeholder:text-gray-300 resize-none overflow-hidden leading-relaxed" />
                    ) : (
                      <div onClick={() => setEditingIssueIdx(idx)}
                        className="flex-1 text-sm leading-relaxed whitespace-pre-wrap break-words min-h-[1.25rem] text-gray-700 cursor-text">
                        {item.text ? <AutoLink text={item.text} /> : <span className="text-gray-300">이슈 내용 입력</span>}
                      </div>
                    )}
                    <button onClick={() => setIssueItems(issueItems.filter((_, i) => i !== idx))}
                      className="shrink-0 text-gray-300 hover:text-red-400 transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border-t border-gray-100">
                    <select value={item.severity ?? ''}
                      onChange={e => { const next = [...issueItems]; next[idx] = { ...next[idx], severity: (e.target.value as Severity) || undefined }; setIssueItems(next) }}
                      className={`text-[11px] font-medium border rounded px-1.5 py-0.5 outline-none cursor-pointer transition-colors ${item.severity ? SEVERITY_STYLE[item.severity].badge : 'bg-white text-gray-400 border-gray-200'}`}>
                      <option value="">심각도</option>
                      {(['크리티컬', '하이', '미디엄', '로우'] as Severity[]).map(sev => (
                        <option key={sev} value={sev}>{sev}</option>
                      ))}
                    </select>
                    <div className="flex-1" />
                    <button onClick={() => { const next = [...issueItems]; next[idx] = { ...next[idx], raised: !next[idx].raised }; setIssueItems(next) }}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${item.raised ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-400 border-gray-200 hover:border-orange-300 hover:text-orange-500'}`}>
                      {item.raised ? '↑ 라이징 ✓' : '↑ 라이징'}
                    </button>
                    {item.raised && (
                      <div className="flex items-center gap-0.5 border border-orange-200 rounded bg-orange-50 px-1.5 py-0.5">
                        <span className="text-[11px] font-mono text-orange-400">#</span>
                        <input type="text" value={(item.issueNo ?? '').replace(/^#+/, '')}
                          onChange={e => { const next = [...issueItems]; next[idx] = { ...next[idx], issueNo: e.target.value.replace(/^#+/, '') }; setIssueItems(next) }}
                          onClick={e => e.stopPropagation()} placeholder="번호"
                          className="w-12 text-[11px] font-mono bg-transparent text-orange-700 placeholder:text-orange-300 outline-none" />
                      </div>
                    )}
                    <button onClick={() => { const next = [...issueItems]; next[idx] = { ...next[idx], fixed: !next[idx].fixed }; setIssueItems(next) }}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${item.fixed ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-400 border-gray-200 hover:border-green-300 hover:text-green-500'}`}>
                      {item.fixed ? '✓ 수정완료' : '수정완료'}
                    </button>
                  </div>
                </div>
              )
            })}
            <button onClick={() => setIssueItems([...issueItems, { text: '', raised: false, fixed: false }])}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 border border-dashed border-gray-300 hover:border-gray-500 rounded px-3 py-1.5 w-full justify-center transition-colors bg-white">
              <Plus className="h-3 w-3" /> 이슈 추가
            </button>
          </div>
        </div>

        <Button size="sm" onClick={handleSaveResult} disabled={savingResult}
          className={`w-fit mt-1 ${resultSaved ? 'bg-green-600 hover:bg-green-600' : 'bg-indigo-600 hover:bg-indigo-700'} text-white`}>
          {resultSaved ? <><Check className="h-3.5 w-3.5 mr-1" />저장됨</> : '결과 저장'}
        </Button>
      </section>
    </div>
  )
}

// ── CreateE2EFromIntegrationModal ─────────────────────────────────────────────

interface CreateE2EModalProps {
  selectedScenarios: ScenarioWithMeta[]
  onClose: () => void
  onCreated: (newE2EId: string) => void
}

function CreateE2EFromIntegrationModal({ selectedScenarios, onClose, onCreated }: CreateE2EModalProps) {
  const [orderedItems, setOrderedItems] = useState(
    selectedScenarios.map(s => ({ id: s.id, title: s.title }))
  )
  const [title, setTitle] = useState('')
  const [businessContext, setBusinessContext] = useState('')
  const [creating, setCreating] = useState(false)

  function moveItem(idx: number, dir: -1 | 1) {
    const target = idx + dir
    if (target < 0 || target >= orderedItems.length) return
    const next = [...orderedItems]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setOrderedItems(next)
  }

  function moveToPosition(fromIdx: number, toPos: number) {
    const target = Math.max(0, Math.min(orderedItems.length - 1, toPos - 1))
    if (target === fromIdx) return
    const next = [...orderedItems]
    const [item] = next.splice(fromIdx, 1)
    next.splice(target, 0, item)
    setOrderedItems(next)
  }

  function removeItem(idx: number) {
    setOrderedItems(orderedItems.filter((_, i) => i !== idx))
  }

  async function handleCreate() {
    if (!title.trim() || orderedItems.length === 0) return
    setCreating(true)
    try {
      const created = await createScenario({ title: title.trim(), scenario_type: 'e2e', business_context: businessContext || null, steps: '', expected_result: '', status: 'active' })
      await setScenarioCompositionsFromParent(created.id, orderedItems.map((item, i) => ({ child_id: item.id, order_index: i })))
      onCreated(created.id)
    } catch (e) { console.error(e) }
    finally { setCreating(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">E2E 시나리오로 묶기</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex flex-col gap-4 p-5 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">E2E 시나리오 제목 *</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} autoFocus
              placeholder="예: 공급사 상품 등록 → 쇼핑몰 구매 전체 흐름"
              className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              구성 통합 시나리오 ({orderedItems.length}개) — 순서 편집 후 저장
            </label>
            <div className="flex flex-col gap-1 border border-gray-200 rounded-lg p-2 bg-gray-50">
              {orderedItems.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3">선택된 시나리오가 없습니다</p>
              ) : (
                orderedItems.map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-2 bg-white rounded-md px-2.5 py-2 border border-gray-100">
                    <span className="text-sm text-gray-400 w-5 text-center shrink-0">{toOrdinal(idx)}</span>
                    <span className="flex-1 text-sm text-gray-800 truncate">{item.title}</span>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <label className="text-[10px] text-gray-400 mr-0.5">순서</label>
                      <input
                        type="number" min={1} max={orderedItems.length}
                        key={`${item.id}-${idx}`} defaultValue={idx + 1}
                        onBlur={e => {
                          const val = parseInt(e.target.value)
                          if (!isNaN(val) && val >= 1 && val <= orderedItems.length && val !== idx + 1) {
                            moveToPosition(idx, val)
                          }
                        }}
                        className="w-12 text-xs text-center border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                      />
                      <button onClick={() => moveItem(idx, -1)} disabled={idx === 0}
                        className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed">
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => moveItem(idx, 1)} disabled={idx === orderedItems.length - 1}
                        className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed">
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => removeItem(idx)} className="p-1 text-gray-300 hover:text-red-400 ml-0.5">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">비즈니스 맥락 (선택)</label>
            <textarea value={businessContext} onChange={e => setBusinessContext(e.target.value)} rows={2}
              placeholder="이 E2E 흐름이 검증하는 비즈니스 목적"
              className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 resize-none" />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <Button size="sm" variant="outline" onClick={onClose}>취소</Button>
          <Button size="sm" onClick={handleCreate}
            disabled={creating || !title.trim() || orderedItems.length === 0}
            className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5">
            {creating ? 'E2E 생성 중...' : 'E2E 생성'}
          </Button>
        </div>
      </div>
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

export function ScenarioTab({ cycleId, systems, onSelectRequirement, refreshKey }: ScenarioTabProps) {
  const [scenarios, setScenarios] = useState<ScenarioWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ScenarioDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [mode, setMode] = useState<'view' | 'create' | 'edit'>('view')

  // 네비게이션 히스토리 (뒤로가기용)
  const [navHistory, setNavHistory] = useState<string[]>([])

  // 시스템 필터
  const [systemFilter, setSystemFilter] = useState<string>('all')

  // E2E 맥락 필터 (통합 탭 전용)
  const [e2eContextFilter, setE2eContextFilter] = useState<string>('all')
  const [availableE2Es, setAvailableE2Es] = useState<{ id: string; title: string }[]>([])

  // 통합 시나리오 다중 선택 (E2E 일괄 생성용)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showCreateE2EModal, setShowCreateE2EModal] = useState(false)

  useEffect(() => {
    setSelectedIds(new Set())
    setE2eContextFilter('all')
    if (typeFilter === 'integration') {
      getE2EScenariosForPicker().then(setAvailableE2Es).catch(console.error)
    } else {
      setAvailableE2Es([])
    }
  }, [typeFilter])

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getScenarios(cycleId, {
        scenarioType: typeFilter !== 'all' ? typeFilter : undefined,
        search: search || undefined,
        systemId: systemFilter !== 'all' ? systemFilter : undefined,
      })
      setScenarios(data)
    } finally {
      setLoading(false)
    }
  }, [cycleId, typeFilter, search, systemFilter, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // E2E 맥락 필터 client-side 적용
  const displayedScenarios = useMemo(() => {
    if (typeFilter !== 'integration' || e2eContextFilter === 'all') return scenarios
    if (e2eContextFilter === 'none') return scenarios.filter(s => !s.parentE2Es || s.parentE2Es.length === 0)
    return scenarios.filter(s => s.parentE2Es?.some(e => e.id === e2eContextFilter))
  }, [scenarios, e2eContextFilter, typeFilter])

  const selectedScenarios = useMemo(
    () => displayedScenarios.filter(s => selectedIds.has(s.id)),
    [displayedScenarios, selectedIds]
  )

  // 목록에서 직접 선택 (히스토리 초기화)
  function handleSelect(id: string) {
    setNavHistory([])
    setSelectedId(id)
    setMode('view')
  }

  // 상세에서 다른 시나리오로 이동 (히스토리 쌓기)
  function handleSelectScenario(id: string) {
    if (selectedId) setNavHistory(prev => [...prev, selectedId])
    setSelectedId(id)
    setMode('view')
  }

  // 뒤로가기
  function handleGoBack() {
    const prev = navHistory[navHistory.length - 1]
    if (!prev) return
    setNavHistory(h => h.slice(0, -1))
    setSelectedId(prev)
    setMode('view')
  }

  function handleCreate() {
    setNavHistory([])
    setSelectedId(null)
    setDetail(null)
    setMode('create')
  }

  async function handleSaved(id: string) {
    await loadList()
    setNavHistory([])
    setSelectedId(id)
    setMode('view')
    await loadDetail(id)
  }

  function handleDelete() {
    setNavHistory([])
    setSelectedId(null)
    setDetail(null)
    setMode('view')
    loadList()
  }

  function handleCheckScenario(id: string, checked: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function handleE2ECreated(newE2EId: string) {
    setShowCreateE2EModal(false)
    setSelectedIds(new Set())
    await loadList()
    setTypeFilter('e2e')
    setNavHistory([])
    setSelectedId(newE2EId)
    setMode('view')
  }

  const showEditor = mode === 'create' || mode === 'edit'

  return (
    <div className="flex gap-4 h-[calc(100vh-160px)]">
      {/* 좌측 목록 패널 */}
      <div className="w-72 shrink-0 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* 헤더 영역 */}
        <div className="p-3 flex flex-col gap-2 border-b border-gray-100">
          {/* 세그먼트 컨트롤 */}
          <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
            {SCENARIO_TYPES.map(t => (
              <button key={t.value} onClick={() => setTypeFilter(t.value)}
                className={`flex-1 text-xs py-1 rounded-md font-medium transition-all ${
                  typeFilter === t.value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* 검색 + 추가 */}
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="제목 검색..."
                className="w-full text-xs border border-gray-200 rounded-md pl-6 pr-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 bg-gray-50" />
            </div>
            <Button size="sm" onClick={handleCreate}
              className="h-[30px] w-[30px] p-0 bg-indigo-600 hover:bg-indigo-700 text-white shrink-0">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* 시스템 필터 */}
          {systems.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => setSystemFilter('all')}
                className={`text-[11px] px-2 py-0.5 rounded-md border font-medium transition-colors ${
                  systemFilter === 'all'
                    ? 'bg-gray-700 text-white border-gray-700'
                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                }`}
              >
                전체
              </button>
              {systems.map(sys => {
                const active = systemFilter === sys.id
                const sc = getSystemColor(sys.name)
                return (
                  <button
                    key={sys.id}
                    onClick={() => setSystemFilter(active ? 'all' : sys.id)}
                    className={`text-[11px] px-2 py-0.5 rounded-md border font-medium transition-colors ${
                      active ? sc.buttonActive : sc.buttonBase
                    }`}
                  >
                    {sys.name}
                  </button>
                )
              })}
            </div>
          )}

          {/* E2E 맥락 필터 (통합 탭 전용) */}
          {typeFilter === 'integration' && (
            <select value={e2eContextFilter}
              onChange={e => { setE2eContextFilter(e.target.value); setSelectedIds(new Set()) }}
              className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-gray-50 focus:outline-none focus:ring-1 focus:ring-orange-300 text-gray-600">
              <option value="all">전체 맥락</option>
              {availableE2Es.map(e2e => (
                <option key={e2e.id} value={e2e.id}>{e2e.title}</option>
              ))}
              <option value="none">미연결</option>
            </select>
          )}
        </div>

        {/* 목록 */}
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
          {loading ? (
            <div className="text-xs text-gray-400 text-center mt-8">불러오는 중...</div>
          ) : displayedScenarios.length === 0 ? (
            <div className="text-xs text-gray-400 text-center mt-8">
              시나리오가 없습니다.<br />
              <button onClick={handleCreate} className="text-indigo-500 hover:underline mt-1">새 시나리오 만들기</button>
            </div>
          ) : (
            displayedScenarios.map(sc => {
              const systemNames = systems
                .filter(s => (sc.system_ids ?? []).includes(s.id))
                .map(s => s.name)
              return (
                <ScenarioListItem
                  key={sc.id}
                  scenario={sc}
                  selected={selectedId === sc.id}
                  onClick={() => handleSelect(sc.id)}
                  checked={typeFilter === 'integration' ? selectedIds.has(sc.id) : undefined}
                  onCheck={typeFilter === 'integration' ? (checked) => handleCheckScenario(sc.id, checked) : undefined}
                  hideTypeBadge={typeFilter !== 'all'}
                  systemNames={systemNames}
                />
              )
            })
          )}
        </div>

        {/* 액션 바 / 통계 푸터 */}
        {typeFilter === 'integration' && selectedIds.size > 0 ? (
          <div className="border-t border-orange-100 bg-orange-50 px-3 py-2 flex items-center justify-between gap-2">
            <span className="text-xs text-orange-700 font-medium">{selectedIds.size}개 선택됨</span>
            <Button size="sm" onClick={() => setShowCreateE2EModal(true)}
              className="h-7 text-xs bg-orange-500 hover:bg-orange-600 text-white gap-1">
              E2E로 묶기 <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <div className="border-t border-gray-100 px-3 py-2">
            <p className="text-xs text-gray-400">총 {displayedScenarios.length}개 시나리오</p>
          </div>
        )}
      </div>

      {/* 우측 상세/편집 패널 */}
      <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden">
        {showEditor ? (
          <ScenarioEditor
            cycleId={cycleId}
            systems={systems}
            initial={mode === 'edit' ? detail : null}
            onSaved={handleSaved}
            onCancel={() => setMode(selectedId ? 'view' : 'view')}
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
            onSelectScenario={handleSelectScenario}
            onGoBack={navHistory.length > 0 ? handleGoBack : undefined}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
            <p className="text-sm">시나리오를 선택하거나 새로 만드세요</p>
            <Button size="sm" onClick={handleCreate} variant="outline" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />새 시나리오
            </Button>
          </div>
        )}
      </div>

      {/* E2E 일괄 생성 모달 */}
      {showCreateE2EModal && (
        <CreateE2EFromIntegrationModal
          selectedScenarios={selectedScenarios}
          onClose={() => setShowCreateE2EModal(false)}
          onCreated={handleE2ECreated}
        />
      )}
    </div>
  )
}
