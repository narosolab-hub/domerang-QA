'use client'

import { useState, useEffect, useRef } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { StatusBadge } from './StatusBadge'
import { updateRequirement, upsertTestResult, logChange, getChangeHistory, deleteRequirements, getRequirementByDisplayId, searchRequirementsForRelated, getRequirementNamesByDisplayIds } from '@/lib/queries'
import type { Requirement, TestResult, TestStatus, Priority, RequirementChange, System, IssueItem, Severity } from '@/lib/types'
import { getSystemColor, SEVERITY_STYLE } from '@/lib/types'
import {
  X, ExternalLink, ChevronDown, ChevronUp,
  PanelRightOpen, PanelRightClose, History, RotateCcw, Pencil, Trash2, Plus,
} from 'lucide-react'

interface Props {
  requirement: (Requirement & { currentResult?: TestResult }) | null
  cycleId: string
  systems: System[]
  onClose: () => void
  onUpdate: () => void
  onNavigate?: (req: Requirement & { currentResult?: TestResult }) => void
}

const STATUS_BUTTONS: { status: TestStatus; label: string; className: string }[] = [
  { status: 'Pass',        label: '✅ Pass',    className: 'bg-green-500 hover:bg-green-600 text-white' },
  { status: 'Fail',        label: '❌ Fail',    className: 'bg-red-500 hover:bg-red-600 text-white' },
  { status: 'Block',       label: '🚧 Block',   className: 'bg-yellow-500 hover:bg-yellow-600 text-white' },
  { status: 'In Progress', label: '🔵 진행중',  className: 'bg-blue-500 hover:bg-blue-600 text-white' },
  { status: '미테스트',    label: '⚪ 미테스트', className: 'bg-gray-200 hover:bg-gray-300 text-gray-700' },
]

// ── 유틸 ──────────────────────────────────────────────────────────────────────
function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 60_000)       return '방금'
  if (diff < 3_600_000)    return `${Math.floor(diff / 60_000)}분 전`
  if (diff < 86_400_000)   return `${Math.floor(diff / 3_600_000)}시간 전`
  if (diff < 604_800_000)  return `${Math.floor(diff / 86_400_000)}일 전`
  return new Date(dateStr).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

function truncate(s: string, n = 22): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

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

const FIELD_STYLE: Record<string, { dot: string; label: string }> = {
  '테스트 상태':    { dot: 'bg-blue-400',   label: '테스트 상태' },
  '최종 정책':      { dot: 'bg-purple-400', label: '최종 정책' },
  '우선순위':       { dot: 'bg-yellow-400', label: '우선순위' },
  '관련 요구사항':  { dot: 'bg-teal-400',   label: '관련 요구사항' },
}

// ── 컴포넌트 ──────────────────────────────────────────────────────────────────
export function SidePanel({ requirement, cycleId, systems, onClose, onUpdate, onNavigate }: Props) {
  const [priority,      setPriority]      = useState<Priority | null>(null)
  const [policyText,    setPolicyText]    = useState('')
  const [policyNote,    setPolicyNote]    = useState('')
  const [precondition,  setPrecondition]  = useState('')
  const [testSteps,     setTestSteps]     = useState('')
  const [expectedResult,setExpectedResult]= useState('')
  const [tester,        setTester]        = useState('')
  const [issueItems,    setIssueItems]    = useState<IssueItem[]>([])
  const [retestReason,  setRetestReason]  = useState<string | null>(null)
  const [relatedIds,          setRelatedIds]          = useState<number[]>([])
  const [relatedMeta,         setRelatedMeta]         = useState<Record<number, { name: string; systemName: string }>>({})
  const [relatedSearch,       setRelatedSearch]       = useState('')
  const [relatedSearchResults,setRelatedSearchResults]= useState<Array<Pick<Requirement, 'id' | 'display_id' | 'feature_name' | 'depth_0' | 'depth_1' | 'systems'>>>([])
  const [relatedSearchOpen,   setRelatedSearchOpen]   = useState(false)
  const policyRef = useRef<HTMLTextAreaElement>(null)
  const [currentStatus, setCurrentStatus] = useState<TestStatus>('미테스트')
  const [note,          setNote]          = useState('')

  // 기본 정보 수정 모드
  const [editingBasic,    setEditingBasic]    = useState(false)
  const [editFeatureName, setEditFeatureName] = useState('')
  const [editSystemId,    setEditSystemId]    = useState('')
  const [editDepth0,      setEditDepth0]      = useState('')
  const [editDepth1,      setEditDepth1]      = useState('')
  const [editDepth2,      setEditDepth2]      = useState('')
  const [editDepth3,      setEditDepth3]      = useState('')
  const [savingBasic,     setSavingBasic]     = useState(false)

  // 링크 표시 (로컬 상태 — prop은 저장 후 갱신 안 됨)
  const [displayScenarioLink, setDisplayScenarioLink] = useState('')
  const [displayBacklogLink,  setDisplayBacklogLink]  = useState('')
  // 링크 편집
  const [editScenarioLink, setEditScenarioLink] = useState('')
  const [editBacklogLink,  setEditBacklogLink]  = useState('')
  // 시나리오 뷰/편집 토글
  const [editingScenario,  setEditingScenario]  = useState(false)
  // 이슈 항목 뷰/편집 토글 (편집 중인 인덱스, null = 읽기 모드)
  const [editingIssueIdx,  setEditingIssueIdx]  = useState<number | null>(null)

  const [deleteOpen,   setDeleteOpen]   = useState(false)
  const [deleting,     setDeleting]     = useState(false)

  const [saving,       setSaving]       = useState(false)
  const [saveSuccess,  setSaveSuccess]  = useState(false)
  const [saveError,    setSaveError]    = useState<string | null>(null)
  const [scenarioOpen, setScenarioOpen] = useState(false)
  const [historyOpen,  setHistoryOpen]  = useState(false)
  const [history,      setHistory]      = useState<RequirementChange[]>([])
  const [wide,         setWide]         = useState(true)

  // 요구사항 변경 시 상태 초기화
  useEffect(() => {
    if (!requirement) return
    setCurrentStatus(requirement.currentResult?.status    ?? '미테스트')
    setPriority(requirement.priority                      ?? null)
    setPolicyText(requirement.current_policy              ?? '')
    setPolicyNote(requirement.policy_note                 ?? '')
    setPrecondition(requirement.precondition              ?? '')
    setTestSteps(requirement.test_steps                   ?? '')
    setExpectedResult(requirement.expected_result         ?? '')
    setTester(requirement.currentResult?.tester             ?? '')
    setRetestReason(requirement.currentResult?.retest_reason ?? null)
    const storedItems = requirement.currentResult?.issue_items ?? []
    if (storedItems.length > 0) {
      setIssueItems(storedItems.map(i => ({
        text: i.text,
        raised: (i as any).raised ?? false,
        fixed: i.fixed ?? false,
        issueNo: i.issueNo,
        severity: i.severity,
      })))
    } else if (requirement.currentResult?.issue_ids) {
      setIssueItems([{ text: requirement.currentResult.issue_ids, raised: false, fixed: false }])
    } else {
      setIssueItems([])
    }
    setNote(requirement.currentResult?.note               ?? '')
    const ids = requirement.related_ids
      ? requirement.related_ids.split(',').map(Number).filter(n => !isNaN(n) && n > 0)
      : []
    setRelatedIds(ids)
    setRelatedSearch('')
    setRelatedSearchResults([])
    setRelatedSearchOpen(false)
    if (ids.length > 0) {
      getRequirementNamesByDisplayIds(ids).then(setRelatedMeta)
    } else {
      setRelatedMeta({})
    }
    setScenarioOpen(!!(requirement.precondition || requirement.test_steps || requirement.expected_result))
    setSaveError(null)
    setSaveSuccess(false)
    setHistoryOpen(false)
    setEditingBasic(false)
    setEditFeatureName(requirement.feature_name ?? '')
    setEditSystemId(requirement.system_id)
    setEditDepth0(requirement.depth_0 ?? '')
    setEditDepth1(requirement.depth_1 ?? '')
    setEditDepth2(requirement.depth_2 ?? '')
    setEditDepth3(requirement.depth_3 ?? '')
    setDisplayScenarioLink(requirement.scenario_link ?? '')
    setDisplayBacklogLink(requirement.backlog_link ?? '')
    setEditScenarioLink(requirement.scenario_link ?? '')
    setEditBacklogLink(requirement.backlog_link ?? '')
    setEditingScenario(false)
    setEditingIssueIdx(null)
    // 이력 불러오기
    getChangeHistory(requirement.id).then(setHistory).catch(() => setHistory([]))
  }, [requirement?.id])

  // 최종 정책 textarea 자동 높이 조정
  useEffect(() => {
    const el = policyRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [policyText])

  // 관련 요구사항 검색 (debounce 250ms)
  useEffect(() => {
    if (!relatedSearch.trim()) { setRelatedSearchResults([]); return }
    const timer = setTimeout(async () => {
      const results = await searchRequirementsForRelated(relatedSearch, requirement?.id)
      setRelatedSearchResults(results)
    }, 250)
    return () => clearTimeout(timer)
  }, [relatedSearch, requirement?.id])

  if (!requirement) return null

  const depthPath = [requirement.depth_0, requirement.depth_1, requirement.depth_2, requirement.depth_3]
    .filter(Boolean).join(' › ')

  // ── 기본 정보 수정 저장 ────────────────────────────────────────────────────
  const handleSaveBasic = async () => {
    setSavingBasic(true)
    setSaveError(null)
    try {
      const updates: Parameters<typeof updateRequirement>[1] = {}

      if (editFeatureName !== (requirement.feature_name ?? '')) {
        updates.feature_name = editFeatureName || null
        await logChange({
          requirement_id: requirement.id,
          changed_field: '요구사항명',
          old_value: requirement.feature_name ?? null,
          new_value: editFeatureName || null,
        })
      }

      if (editSystemId !== requirement.system_id) {
        updates.system_id = editSystemId
        const oldSys = systems.find(s => s.id === requirement.system_id)?.name ?? null
        const newSys = systems.find(s => s.id === editSystemId)?.name ?? null
        await logChange({
          requirement_id: requirement.id,
          changed_field: '시스템',
          old_value: oldSys,
          new_value: newSys,
        })
      }

      const oldPath = [requirement.depth_0, requirement.depth_1, requirement.depth_2, requirement.depth_3].filter(Boolean).join(' › ')
      const newPath = [editDepth0, editDepth1, editDepth2, editDepth3].filter(Boolean).join(' › ')
      if (newPath !== oldPath) {
        updates.depth_0 = editDepth0 || null
        updates.depth_1 = editDepth1 || null
        updates.depth_2 = editDepth2 || null
        updates.depth_3 = editDepth3 || null
        await logChange({
          requirement_id: requirement.id,
          changed_field: '경로',
          old_value: oldPath || null,
          new_value: newPath || null,
        })
      }

      if (editScenarioLink !== displayScenarioLink) {
        updates.scenario_link = editScenarioLink || null
        await logChange({
          requirement_id: requirement.id,
          changed_field: '시나리오 링크',
          old_value: displayScenarioLink || null,
          new_value: editScenarioLink || null,
        })
      }

      if (editBacklogLink !== displayBacklogLink) {
        updates.backlog_link = editBacklogLink || null
        await logChange({
          requirement_id: requirement.id,
          changed_field: '백로그 링크',
          old_value: displayBacklogLink || null,
          new_value: editBacklogLink || null,
        })
      }

      if (Object.keys(updates).length > 0) {
        await updateRequirement(requirement.id, updates)
      }

      // 로컬 표시 상태 즉시 업데이트 (prop은 갱신되지 않으므로)
      setDisplayScenarioLink(editScenarioLink)
      setDisplayBacklogLink(editBacklogLink)
      getChangeHistory(requirement.id).then(setHistory)
      onUpdate()
      setEditingBasic(false)
    } catch (e: any) {
      setSaveError(e?.message ?? '저장 실패')
    } finally {
      setSavingBasic(false)
    }
  }

  const handleCancelBasic = () => {
    setEditFeatureName(requirement.feature_name ?? '')
    setEditSystemId(requirement.system_id)
    setEditDepth0(requirement.depth_0 ?? '')
    setEditDepth1(requirement.depth_1 ?? '')
    setEditDepth2(requirement.depth_2 ?? '')
    setEditDepth3(requirement.depth_3 ?? '')
    setEditScenarioLink(displayScenarioLink)
    setEditBacklogLink(displayBacklogLink)
    setEditingBasic(false)
  }

  // ── 관련 요구사항 이동 ──────────────────────────────────────────────────────
  const handleNavigateToRelated = async (displayId: number) => {
    if (!onNavigate || !cycleId) return
    const req = await getRequirementByDisplayId(displayId, cycleId)
    if (req) onNavigate(req)
  }

  // ── 요구사항 삭제 ──────────────────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteRequirements([requirement.id])
      onUpdate()
      onClose()
    } catch (e: any) {
      setSaveError(e?.message ?? '삭제 실패')
    } finally {
      setDeleting(false)
      setDeleteOpen(false)
    }
  }

  // ── 상태 버튼 클릭 → 즉시 저장 + 이력 기록 ───────────────────────────────
  const handleStatusChange = async (status: TestStatus) => {
    if (!cycleId) return
    const prevStatus = currentStatus
    if (status === prevStatus) return
    setCurrentStatus(status)
    setSaveError(null)
    setSaving(true)
    try {
      await upsertTestResult({
        requirement_id: requirement.id,
        cycle_id: cycleId,
        status,
        tester: tester || undefined,
        issue_raised: issueItems.length > 0 && issueItems.every(i => i.raised),
        issue_fixed: issueItems.length > 0 && issueItems.every(i => i.fixed),
        issue_items: issueItems,
        retest_reason: retestReason,
        note: note || undefined,
      })
      // 이력 기록
      await logChange({
        requirement_id: requirement.id,
        changed_field: '테스트 상태',
        old_value: prevStatus,
        new_value: status,
        change_reason: tester || null,
      })
      // 이력 목록 갱신
      getChangeHistory(requirement.id).then(setHistory)
      onUpdate()
    } catch (e: any) {
      setCurrentStatus(prevStatus)
      setSaveError(e?.message ?? '저장 실패. Supabase 마이그레이션이 실행됐는지 확인해주세요.')
    } finally {
      setSaving(false)
    }
  }

  // ── 저장 버튼 → 요구사항 + 테스트 결과 일괄 저장 + 이력 기록 ─────────────
  const handleSaveRequirement = async () => {
    setSaving(true)
    setSaveSuccess(false)
    setSaveError(null)
    try {
      // 우선순위 변경 이력
      if (priority !== requirement.priority) {
        await logChange({
          requirement_id: requirement.id,
          changed_field: '우선순위',
          old_value: requirement.priority ?? null,
          new_value: priority ?? null,
        })
      }

      // 관련 요구사항 변경 이력
      const newRelatedStr = relatedIds.length > 0 ? relatedIds.join(',') : null
      const oldRelatedStr = requirement.related_ids ?? null
      if (newRelatedStr !== oldRelatedStr) {
        await logChange({
          requirement_id: requirement.id,
          changed_field: '관련 요구사항',
          old_value: oldRelatedStr ? oldRelatedStr.split(',').map(n => `#${n}`).join(', ') : null,
          new_value: newRelatedStr ? newRelatedStr.split(',').map(n => `#${n}`).join(', ') : null,
        })
      }

      const updates: Parameters<typeof updateRequirement>[1] = {
        priority,
        related_ids: newRelatedStr,
        precondition: precondition || null,
        test_steps: testSteps || null,
        expected_result: expectedResult || null,
      }

      // 정책 변경 이력
      if (policyText !== (requirement.current_policy ?? '')) {
        updates.current_policy = policyText || null
        updates.policy_note = policyNote || null
        updates.policy_updated_at = new Date().toISOString()
        await logChange({
          requirement_id: requirement.id,
          changed_field: '최종 정책',
          old_value: requirement.current_policy ?? null,
          new_value: policyText || null,
          change_reason: policyNote || null,
        })
      }

      await updateRequirement(requirement.id, updates)

      if (cycleId) {
        const prevResult = requirement.currentResult

        // 재테스트 사유 변경 이력
        const prevRetest = prevResult?.retest_reason ?? null
        if (retestReason !== prevRetest) {
          await logChange({
            requirement_id: requirement.id,
            changed_field: '재테스트 사유',
            old_value: prevRetest,
            new_value: retestReason,
          })
        }

        const newIssueRaised = issueItems.length > 0 && issueItems.every(i => i.raised)
        const newIssueFixed  = issueItems.length > 0 && issueItems.every(i => i.fixed)

        // 이슈라이징 변경 이력
        const prevRaised = prevResult?.issue_raised ?? false
        if (newIssueRaised !== prevRaised) {
          await logChange({
            requirement_id: requirement.id,
            changed_field: '이슈라이징',
            old_value: prevRaised ? '완료' : '미완료',
            new_value: newIssueRaised ? '완료' : '미완료',
          })
        }

        // 수정 여부 변경 이력
        const prevFixed = prevResult?.issue_fixed ?? false
        if (newIssueFixed !== prevFixed) {
          await logChange({
            requirement_id: requirement.id,
            changed_field: '수정 여부',
            old_value: prevFixed ? '수정 완료' : '미수정',
            new_value: newIssueFixed ? '수정 완료' : '미수정',
          })
        }

        await upsertTestResult({
          requirement_id: requirement.id,
          cycle_id: cycleId,
          status: currentStatus,
          tester: tester || undefined,
          issue_raised: newIssueRaised,
          issue_fixed: newIssueFixed,
          issue_items: issueItems,
          retest_reason: retestReason,
          note: note || undefined,
        })
      }

      // 이력 갱신 후 성공 피드백
      getChangeHistory(requirement.id).then(setHistory)
      onUpdate()
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    } catch (e: any) {
      setSaveError(e?.message ?? '저장 실패. Supabase 마이그레이션이 실행됐는지 확인해주세요.')
    } finally {
      setSaving(false)
    }
  }


  return (
    <>
    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>요구사항을 삭제하시겠습니까?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-gray-800">
              {requirement.feature_name ?? '(기능명 없음)'}
            </span>
            <br />
            삭제하면 관련 테스트 결과와 변경 이력도 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
          >
            {deleting ? '삭제 중...' : '삭제'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <Sheet open={!!requirement} onOpenChange={onClose}>
      <SheetContent
        className="flex flex-col overflow-hidden p-0 transition-[width] duration-200 sm:max-w-none"
        style={{ width: wide ? '65vw' : '420px' }}
        showCloseButton={false}
      >
        {/* ── 스티키 헤더 ────────────────────────────────────────────────── */}
        <div className="flex-none bg-white z-10 border-b">
          <SheetHeader className="px-5 py-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <SheetTitle className="text-base font-semibold leading-tight truncate flex items-center gap-1.5">
                  {requirement.display_id && (
                    <span className="text-xs font-mono font-normal text-gray-400 shrink-0">
                      #{requirement.display_id}
                    </span>
                  )}
                  {requirement.feature_name ?? '(기능명 없음)'}
                </SheetTitle>
                {depthPath && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{depthPath}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {retestReason && (
                  <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-300 font-medium">
                    🔄 {retestReason}
                  </Badge>
                )}
                <StatusBadge status={currentStatus} />
                <Button
                  variant="ghost" size="icon"
                  onClick={() => setDeleteOpen(true)}
                  className="h-7 w-7 text-gray-400 hover:text-red-500 hover:bg-red-50"
                  title="요구사항 삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setWide(w => !w)} className="h-7 w-7" title={wide ? '좁게' : '넓게'}>
                  {wide ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </SheetHeader>
        </div>

        <div className={wide ? 'flex flex-1 min-h-0' : 'flex-1 overflow-y-auto px-5 py-4 space-y-5'}>

          {/* ══ 왼쪽 컬럼: 스펙 참조 ══════════════════════════════════════════ */}
          <div className={wide ? 'w-[48%] overflow-y-auto px-5 py-4 space-y-5 border-r border-gray-100' : 'contents'}>

          {/* ── 기본 정보 ─────────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">기본 정보</h3>
              {!editingBasic ? (
                <button
                  onClick={() => setEditingBasic(true)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 border border-gray-200 hover:border-gray-400 rounded px-2 py-0.5 transition-colors"
                >
                  <Pencil className="h-3 w-3" /> 수정
                </button>
              ) : (
                <div className="flex gap-1.5">
                  <button
                    onClick={handleSaveBasic}
                    disabled={savingBasic}
                    className="text-xs px-2.5 py-0.5 rounded bg-gray-800 text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
                  >
                    {savingBasic ? '저장 중...' : '저장'}
                  </button>
                  <button
                    onClick={handleCancelBasic}
                    className="text-xs px-2.5 py-0.5 rounded border border-gray-300 text-gray-500 hover:border-gray-500 transition-colors"
                  >
                    취소
                  </button>
                </div>
              )}
            </div>

            {!editingBasic ? (
              /* 읽기 모드 */
              <div className="space-y-2 text-sm">
                <div className="flex gap-2 items-center">
                  <span className="text-gray-500 w-14 shrink-0">시스템</span>
                  {(() => {
                    const sysName = (requirement.systems as any)?.name
                    return (
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSystemColor(sysName).badge}`}>
                        {sysName ?? '-'}
                      </span>
                    )
                  })()}
                </div>
                {depthPath && (
                  <div className="flex gap-2">
                    <span className="text-gray-500 w-14 shrink-0">경로</span>
                    <span className="text-gray-700 text-xs leading-relaxed">{depthPath}</span>
                  </div>
                )}
                <div className="flex gap-2 items-center">
                  <span className="text-gray-500 w-14 shrink-0">우선순위</span>
                  <div className="flex gap-1">
                    {(['높음', '중간', '낮음'] as Priority[]).map(p => {
                      const base: Record<Priority, string> = {
                        높음: 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200',
                        중간: 'bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-yellow-200',
                        낮음: 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200',
                      }
                      const active: Record<Priority, string> = {
                        높음: 'bg-red-500 text-white border-red-500',
                        중간: 'bg-yellow-500 text-white border-yellow-500',
                        낮음: 'bg-blue-500 text-white border-blue-500',
                      }
                      return (
                        <button
                          key={p}
                          onClick={() => setPriority(priority === p ? null : p)}
                          className={`px-2.5 py-0.5 rounded text-xs font-medium border transition-colors ${
                            priority === p ? active[p] : base[p]
                          }`}
                        >
                          {p}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="flex gap-2 items-center flex-wrap pt-0.5">
                  <span className="text-gray-500 w-14 shrink-0">링크</span>
                  {displayScenarioLink ? (
                    <a href={displayScenarioLink} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                      <ExternalLink className="h-3 w-3" /> 시나리오
                    </a>
                  ) : (
                    <span className="text-xs text-gray-300">시나리오 링크 없음</span>
                  )}
                  {displayBacklogLink ? (
                    <a href={displayBacklogLink} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                      <ExternalLink className="h-3 w-3" /> 백로그
                    </a>
                  ) : (
                    <span className="text-xs text-gray-300 ml-2">백로그 링크 없음</span>
                  )}
                  <button
                    onClick={() => setEditingBasic(true)}
                    className="ml-1 text-xs text-gray-400 hover:text-blue-600 underline"
                  >
                    수정
                  </button>
                </div>

                {/* 관련 요구사항 */}
                <div className="flex gap-2 items-start pt-0.5">
                  <span className="text-gray-500 w-14 shrink-0 text-sm pt-1">관련</span>
                  <div className="flex-1 min-w-0">
                    {/* 칩 목록 */}
                    {relatedIds.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {relatedIds.map(id => {
                          const meta = relatedMeta[id]
                          const c = getSystemColor(meta?.systemName)
                          return (
                            <span
                              key={id}
                              className={`inline-flex items-center gap-0.5 pl-1.5 pr-1 py-0.5 rounded text-xs ${c.chip}`}
                            >
                              {meta?.systemName && (
                                <span className={`px-1 py-0 rounded text-[10px] font-medium mr-0.5 ${c.tag}`}>
                                  {meta.systemName}
                                </span>
                              )}
                              <button
                                onClick={() => handleNavigateToRelated(id)}
                                className="hover:underline"
                                title={`#${id}로 이동`}
                              >
                                <span className="font-mono">#{id}</span>
                                {meta?.name && (
                                  <span className="ml-1">
                                    {meta.name.length > 12 ? meta.name.slice(0, 12) + '…' : meta.name}
                                  </span>
                                )}
                              </button>
                              <button
                                onClick={() => setRelatedIds(relatedIds.filter(r => r !== id))}
                                className="ml-0.5 leading-none opacity-60 hover:opacity-100"
                                title="연동 해제"
                              >
                                ×
                              </button>
                            </span>
                          )
                        })}
                      </div>
                    )}
                    {/* 검색 입력 + 드롭다운 */}
                    <div className="relative">
                      <input
                        type="text"
                        value={relatedSearch}
                        onChange={e => { setRelatedSearch(e.target.value); setRelatedSearchOpen(true) }}
                        onFocus={() => { if (relatedSearch.trim()) setRelatedSearchOpen(true) }}
                        onBlur={() => setTimeout(() => setRelatedSearchOpen(false), 200)}
                        placeholder="요구사항명 또는 #번호로 검색..."
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:border-teal-400 outline-none placeholder:text-gray-300"
                      />
                      {relatedSearchOpen && relatedSearchResults.length > 0 && (
                        <div className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-200 rounded-md shadow-md mt-0.5 max-h-52 overflow-y-auto">
                          {relatedSearchResults.map(r => {
                            const alreadyAdded = r.display_id != null && relatedIds.includes(r.display_id)
                            return (
                              <button
                                key={r.id}
                                onMouseDown={() => {
                                  if (!alreadyAdded && r.display_id != null) {
                                    setRelatedIds(prev => [...prev, r.display_id!])
                                    setRelatedMeta(prev => ({ ...prev, [r.display_id!]: { name: r.feature_name ?? '', systemName: (r.systems as any)?.name ?? '' } }))
                                  }
                                  setRelatedSearch('')
                                  setRelatedSearchOpen(false)
                                }}
                                className={`w-full text-left px-3 py-1.5 border-b last:border-0 transition-colors ${
                                  alreadyAdded ? 'bg-gray-50 opacity-60 cursor-default' : 'hover:bg-teal-50'
                                }`}
                              >
                                <div className="flex items-center gap-1.5">
                                  {r.display_id && <span className="text-xs font-mono text-gray-400 shrink-0">#{r.display_id}</span>}
                                  <span className="text-xs text-gray-700 truncate">{r.feature_name ?? '(기능명 없음)'}</span>
                                  {alreadyAdded && <span className="ml-auto text-xs text-teal-500 shrink-0">추가됨</span>}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {(r.systems as any)?.name && (
                                    <span className={`text-[11px] px-1.5 py-0 rounded shrink-0 ${getSystemColor((r.systems as any).name).tag}`}>
                                      {(r.systems as any).name}
                                    </span>
                                  )}
                                  {(r.depth_0 || r.depth_1) && (
                                    <span className="text-[11px] text-gray-400 truncate">{[r.depth_0, r.depth_1].filter(Boolean).join(' › ')}</span>
                                  )}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* 수정 모드 */
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">요구사항명</label>
                  <Input
                    value={editFeatureName}
                    onChange={e => setEditFeatureName(e.target.value)}
                    placeholder="요구사항명"
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">시스템</label>
                  <Select value={editSystemId} onValueChange={setEditSystemId}>
                    <SelectTrigger className="text-sm h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {systems.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">0Depth</label>
                    <Input value={editDepth0} onChange={e => setEditDepth0(e.target.value)} placeholder="대분류" className="text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">1Depth</label>
                    <Input value={editDepth1} onChange={e => setEditDepth1(e.target.value)} placeholder="중분류" className="text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">2Depth</label>
                    <Input value={editDepth2} onChange={e => setEditDepth2(e.target.value)} placeholder="소분류" className="text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">3Depth</label>
                    <Input value={editDepth3} onChange={e => setEditDepth3(e.target.value)} placeholder="세부" className="text-sm" />
                  </div>
                </div>
                <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                  ⚠️ 기초 데이터 변경 시 필터/통계에 즉시 반영됩니다
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">시나리오 링크</label>
                    <Input
                      value={editScenarioLink}
                      onChange={e => setEditScenarioLink(e.target.value)}
                      placeholder="https://..."
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">백로그 링크</label>
                    <Input
                      value={editBacklogLink}
                      onChange={e => setEditBacklogLink(e.target.value)}
                      placeholder="https://..."
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>
            )}
          </section>

          <Separator />

          {/* ── 기존 요구사항 ──────────────────────────────────────────────── */}
          {requirement.original_spec && (
            <>
              <section>
                <h3 className="text-sm font-semibold mb-2 text-gray-700">기존 요구사항</h3>
                <p className="text-sm text-gray-600 bg-gray-50 rounded p-3 whitespace-pre-wrap leading-relaxed">
                  <AutoLink text={requirement.original_spec} />
                </p>
              </section>
              <Separator />
            </>
          )}

          {/* ── 최종 정책 ─────────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">최종 정책</h3>
              {requirement.policy_updated_at && (
                <span className="text-[11px] text-gray-400">
                  {formatRelativeTime(requirement.policy_updated_at)} 수정
                  {requirement.policy_note && ` · ${truncate(requirement.policy_note, 16)}`}
                </span>
              )}
            </div>
            <Textarea
              ref={policyRef}
              value={policyText}
              onChange={e => setPolicyText(e.target.value)}
              placeholder="정책 변경 사항이 있으면 입력하세요"
              className="text-sm min-h-[80px] resize-none overflow-hidden"
            />
            {policyText !== (requirement.current_policy ?? '') && policyText && (
              <div className="mt-2">
                <Input
                  value={policyNote}
                  onChange={e => setPolicyNote(e.target.value)}
                  placeholder="변경 사유 (선택)"
                  className="text-sm"
                />
              </div>
            )}
          </section>

          </div>{/* ══ end 왼쪽 컬럼 ═══════════════════════════════════════════════════ */}

          {!wide && <Separator />}

          {/* ══ 오른쪽 컬럼: 테스트 실행 ════════════════════════════════════ */}
          <div className={wide ? 'flex-1 overflow-y-auto px-5 py-4 space-y-5' : 'contents'}>

          {/* ── 기대 결과 ─────────────────────────────────────────────────── */}
          <section>
            <h3 className="text-sm font-semibold mb-2 text-gray-700">기대 결과</h3>
            <Textarea
              value={expectedResult}
              onChange={e => setExpectedResult(e.target.value)}
              placeholder="정상 동작 시 예상 결과"
              className="text-sm h-20"
            />
          </section>

          <Separator />

          {/* ── 테스트 시나리오 (접기/펼치기) ─────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <button
                className="flex items-center gap-2 text-sm font-semibold text-gray-700"
                onClick={() => setScenarioOpen(!scenarioOpen)}
              >
                테스트 시나리오
                {scenarioOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {(requirement.precondition || requirement.test_steps) && (
                  <Badge variant="secondary" className="text-xs ml-1">작성됨</Badge>
                )}
              </button>
              {scenarioOpen && !editingScenario && (
                <button
                  onClick={() => setEditingScenario(true)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 border border-gray-200 hover:border-gray-400 rounded px-2 py-0.5 transition-colors"
                >
                  <Pencil className="h-3 w-3" /> 수정
                </button>
              )}
            </div>

            {/* 읽기 모드 */}
            {scenarioOpen && !editingScenario && (
              <div className="text-sm text-gray-600 bg-gray-50 rounded p-3 space-y-3">
                {precondition && (
                  <div>
                    <span className="text-xs text-gray-400 block mb-0.5">사전 조건</span>
                    <p className="whitespace-pre-wrap leading-relaxed"><AutoLink text={precondition} /></p>
                  </div>
                )}
                {testSteps && (
                  <div>
                    <span className="text-xs text-gray-400 block mb-0.5">테스트 순서</span>
                    <p className="whitespace-pre-wrap leading-relaxed"><AutoLink text={testSteps} /></p>
                  </div>
                )}
                {!precondition && !testSteps && (
                  <p className="text-xs text-gray-400 text-center py-1">작성된 시나리오가 없습니다</p>
                )}
              </div>
            )}

            {/* 편집 모드 */}
            {scenarioOpen && editingScenario && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">사전 조건</label>
                  <Textarea value={precondition} onChange={e => setPrecondition(e.target.value)}
                    placeholder="테스트 전 필요한 상태" className="text-sm h-16" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">테스트 순서</label>
                  <Textarea value={testSteps} onChange={e => setTestSteps(e.target.value)}
                    placeholder="1. 메인 페이지 접속&#10;2. ..." className="text-sm h-24" />
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => setEditingScenario(false)}
                    className="text-xs px-2.5 py-0.5 rounded border border-gray-300 text-gray-500 hover:border-gray-500 transition-colors"
                  >
                    완료
                  </button>
                </div>
              </div>
            )}
          </section>

          <Separator />

          {/* ── 테스트 결과 ────────────────────────────────────────────────── */}
          <section>
            <h3 className="text-sm font-semibold mb-3 text-gray-700">테스트 결과</h3>

            {/* 상태 버튼 */}
            <div className="flex flex-wrap gap-2 mb-3">
              {STATUS_BUTTONS.map(btn => (
                <button
                  key={btn.status}
                  onClick={() => handleStatusChange(btn.status)}
                  disabled={saving}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${btn.className} ${
                    currentStatus === btn.status
                      ? 'ring-2 ring-offset-1 ring-gray-400'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* 재테스트 사유 선택 */}
            <div className="mb-3">
              <p className="text-xs text-gray-500 mb-1.5 flex items-center gap-1">
                <RotateCcw className="h-3 w-3" /> 재테스트 사유
              </p>
              <div className="flex gap-1.5 flex-wrap">
                {(['UIUX 수정', '정책 변경', '기타'] as const).map(reason => (
                  <button
                    key={reason}
                    onClick={() => setRetestReason(retestReason === reason ? null : reason)}
                    className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                      retestReason === reason
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-white text-gray-500 border-gray-300 hover:border-amber-400 hover:text-amber-600'
                    }`}
                  >
                    {reason}
                  </button>
                ))}
                {retestReason && (
                  <button
                    onClick={() => setRetestReason(null)}
                    className="px-2 py-1 rounded text-xs text-gray-400 border border-gray-200 hover:border-gray-400 hover:text-gray-600 transition-colors"
                  >
                    ✕ 해제
                  </button>
                )}
              </div>
            </div>

            {/* 테스터 / 비고 */}
            <div className="space-y-2">
              <Input
                value={tester}
                onChange={e => setTester(e.target.value)}
                placeholder="테스터 이름"
                className="text-sm"
              />
              {/* 테스트 일시 표시 */}
              {requirement.currentResult?.tested_at && (
                <p className="text-xs text-gray-400">
                  마지막 테스트: {formatRelativeTime(requirement.currentResult.tested_at)}
                  {requirement.currentResult.tester && ` · ${requirement.currentResult.tester}`}
                </p>
              )}
              <Textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="비고 (재현 방법, 환경 등)"
                className="text-sm h-16"
              />
            </div>

            {/* 이슈 관리 */}
            <div className="mt-4 border rounded-lg p-3 space-y-2 bg-gray-50 border-gray-200">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">이슈 관리</h4>

              {/* 이슈 항목 목록 */}
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

                      {/* 텍스트 영역 */}
                      <div className="flex items-start gap-2 px-3 py-2.5">
                        {editingIssueIdx === idx ? (
                          <textarea
                            value={item.text}
                            onChange={e => {
                              const next = [...issueItems]
                              next[idx] = { ...next[idx], text: e.target.value }
                              setIssueItems(next)
                            }}
                            onInput={e => {
                              const el = e.currentTarget
                              el.style.height = 'auto'
                              el.style.height = `${el.scrollHeight}px`
                            }}
                            onBlur={() => setEditingIssueIdx(null)}
                            autoFocus
                            rows={1}
                            placeholder="이슈 내용 입력"
                            className="flex-1 text-sm border-none outline-none bg-transparent placeholder:text-gray-300 resize-none overflow-hidden leading-relaxed"
                          />
                        ) : (
                          <div
                            onClick={() => setEditingIssueIdx(idx)}
                            className="flex-1 text-sm leading-relaxed whitespace-pre-wrap break-words min-h-[1.25rem] text-gray-700 cursor-text"
                          >
                            {item.text
                              ? <AutoLink text={item.text} />
                              : <span className="text-gray-300">이슈 내용 입력</span>
                            }
                          </div>
                        )}
                        <button
                          onClick={() => setIssueItems(issueItems.filter((_, i) => i !== idx))}
                          className="shrink-0 text-gray-300 hover:text-red-400 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* 액션 바 */}
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border-t border-gray-100">
                        {/* 심각도 */}
                        <select
                          value={item.severity ?? ''}
                          onChange={e => {
                            const next = [...issueItems]
                            next[idx] = { ...next[idx], severity: (e.target.value as Severity) || undefined }
                            setIssueItems(next)
                          }}
                          className={`text-[11px] font-medium border rounded px-1.5 py-0.5 outline-none cursor-pointer transition-colors ${
                            item.severity ? SEVERITY_STYLE[item.severity].badge : 'bg-white text-gray-400 border-gray-200'
                          }`}
                        >
                          <option value="">심각도</option>
                          {(['크리티컬', '하이', '미디엄', '로우'] as Severity[]).map(sev => (
                            <option key={sev} value={sev}>{sev}</option>
                          ))}
                        </select>

                        <div className="flex-1" />

                        {/* 이슈라이징 */}
                        <button
                          onClick={() => {
                            const next = [...issueItems]
                            next[idx] = { ...next[idx], raised: !next[idx].raised }
                            setIssueItems(next)
                          }}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                            item.raised
                              ? 'bg-orange-500 text-white border-orange-500'
                              : 'bg-white text-gray-400 border-gray-200 hover:border-orange-300 hover:text-orange-500'
                          }`}
                        >
                          {item.raised ? '↑ 라이징 ✓' : '↑ 라이징'}
                        </button>
                        {item.raised && (
                          <div className="flex items-center gap-0.5 border border-orange-200 rounded bg-orange-50 px-1.5 py-0.5">
                            <span className="text-[11px] font-mono text-orange-400">#</span>
                            <input
                              type="text"
                              value={(item.issueNo ?? '').replace(/^#+/, '')}
                              onChange={e => {
                                const next = [...issueItems]
                                next[idx] = { ...next[idx], issueNo: e.target.value.replace(/^#+/, '') }
                                setIssueItems(next)
                              }}
                              onClick={e => e.stopPropagation()}
                              placeholder="번호"
                              className="w-12 text-[11px] font-mono bg-transparent text-orange-700 placeholder:text-orange-300 outline-none"
                            />
                          </div>
                        )}
                        {/* 수정완료 */}
                        <button
                          onClick={() => {
                            const next = [...issueItems]
                            next[idx] = { ...next[idx], fixed: !next[idx].fixed }
                            setIssueItems(next)
                          }}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                            item.fixed
                              ? 'bg-green-500 text-white border-green-500'
                              : 'bg-white text-gray-400 border-gray-200 hover:border-green-300 hover:text-green-500'
                          }`}
                        >
                          {item.fixed ? '✓ 수정완료' : '수정완료'}
                        </button>
                      </div>

                    </div>
                  )
                })}
                <button
                  onClick={() => setIssueItems([...issueItems, { text: '', raised: false, fixed: false }])}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 border border-dashed border-gray-300 hover:border-gray-500 rounded px-3 py-1.5 w-full justify-center transition-colors bg-white"
                >
                  <Plus className="h-3 w-3" /> 이슈 추가
                </button>
              </div>
            </div>
          </section>

          <Separator />

          {/* ── 변경 이력 ─────────────────────────────────────────────────── */}
          <section>
            <button
              className="flex items-center gap-2 w-full text-sm font-semibold text-gray-700 mb-2"
              onClick={() => setHistoryOpen(!historyOpen)}
            >
              <History className="h-4 w-4 text-gray-400" />
              변경 이력
              {historyOpen ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
              {history.length > 0 && (
                <Badge variant="secondary" className="text-xs">{history.length}</Badge>
              )}
            </button>
            {historyOpen && (
              <div className="space-y-0">
                {history.length === 0 ? (
                  <p className="text-xs text-gray-400 py-3 text-center">변경 이력이 없습니다</p>
                ) : (
                  history.map(h => {
                    const cfg = FIELD_STYLE[h.changed_field] ?? { dot: 'bg-gray-300', label: h.changed_field }
                    return (
                      <div key={h.id} className="flex gap-2.5 py-2 border-b border-gray-50 last:border-0">
                        <div className="pt-1.5 shrink-0">
                          <span className={`block w-2 h-2 rounded-full ${cfg.dot}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-xs font-medium text-gray-700">{cfg.label}</span>
                            <span className="text-[11px] text-gray-400 shrink-0 whitespace-nowrap">
                              {formatRelativeTime(h.changed_at)}
                            </span>
                          </div>
                          {(h.old_value || h.new_value) && (
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              {h.old_value ? `${truncate(h.old_value)} → ` : '→ '}
                              <span className="text-gray-700 font-medium">
                                {h.new_value ? truncate(h.new_value) : '(삭제)'}
                              </span>
                            </p>
                          )}
                          {h.change_reason && (
                            <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                              사유: {h.change_reason}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </section>

          {/* ── 에러 / 성공 피드백 + 저장 버튼 ──────────────────────────── */}
          {saveError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              ⚠️ {saveError}
            </div>
          )}
          <div className="pb-6">
            <Button
              onClick={handleSaveRequirement}
              disabled={saving}
              className={`w-full transition-colors ${saveSuccess ? 'bg-green-600 hover:bg-green-700' : ''}`}
            >
              {saving ? '저장 중...' : saveSuccess ? '✓ 저장됨' : '저장'}
            </Button>
          </div>

          </div>{/* ══ end 오른쪽 컬럼 ══════════════════════════════════════════════════ */}
        </div>{/* ══ end 컨텐츠 래퍼 ══════════════════════════════════════════════════ */}
      </SheetContent>
    </Sheet>
    </>
  )
}
