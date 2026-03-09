'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CycleSelector } from '@/components/CycleSelector'
import { DashboardTab } from '@/components/DashboardTab'
import { RequirementsTab } from '@/components/RequirementsTab'
import { BacklogTab } from '@/components/BacklogTab'
import { IssueTab } from '@/components/IssueTab'
import { ScenarioTab } from '@/components/ScenarioTab'
import { ScenarioSidePanel } from '@/components/ScenarioSidePanel'
import { SidePanel } from '@/components/SidePanel'
import { UploadModal } from '@/components/UploadModal'
import { AddRequirementModal } from '@/components/AddRequirementModal'
import { getSystems, getTestCycles, getRequirementByDisplayId } from '@/lib/queries'
import type { System, TestCycle, Requirement, TestResult } from '@/lib/types'
import { Upload, Plus } from 'lucide-react'

type ReqWithResult = Requirement & { currentResult?: TestResult }

export default function Home() {
  const [systems, setSystems] = useState<System[]>([])
  const [cycles, setCycles] = useState<TestCycle[]>([])
  const [selectedCycleId, setSelectedCycleId] = useState('')
  const [selectedReq, setSelectedReq] = useState<ReqWithResult | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeTab, setActiveTab] = useState('dashboard')

  // URL 탭 동기화 — 마운트 시 ?tab= 파라미터로 초기 탭 결정
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tab = params.get('tab')
    const validTabs = ['dashboard', 'requirements', 'backlog', 'issues', 'scenarios']
    if (tab && validTabs.includes(tab)) setActiveTab(tab)
  }, [])
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null)
  // 이슈 탭에서 시나리오 클릭 시 사이드패널로 열기 (탭 전환 없음)
  const [scenarioPanelId, setScenarioPanelId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => setRefreshKey(k => k + 1), [])

  useEffect(() => {
    Promise.all([getSystems(), getTestCycles()]).then(async ([s, c]) => {
      setSystems(s)
      setCycles(c)
      const lastCycle = c[c.length - 1]
      if (lastCycle) setSelectedCycleId(lastCycle.id)

      // URL 파라미터로 초기 상태 복원
      const params = new URLSearchParams(window.location.search)
      const reqParam = params.get('req')
      const scenarioParam = params.get('scenario')
      if (reqParam && lastCycle) {
        const req = await getRequirementByDisplayId(Number(reqParam), lastCycle.id)
        if (req) setSelectedReq(req)
      }
      if (scenarioParam) {
        setSelectedScenarioId(scenarioParam)
      }
    }).finally(() => setLoading(false))
  }, [])

  const selectedCycle = cycles.find(c => c.id === selectedCycleId) ?? null

  const syncUrl = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(window.location.search)
    for (const [key, val] of Object.entries(updates)) {
      if (val === null) params.delete(key)
      else params.set(key, val)
    }
    window.history.replaceState(null, '', `?${params.toString()}`)
  }

  const syncTabUrl = (tab: string) => syncUrl({ tab })

  // selectedReq 변화 → &req={display_id} URL 동기화
  useEffect(() => {
    if (loading) return
    syncUrl({ req: selectedReq?.display_id != null ? String(selectedReq.display_id) : null })
  }, [selectedReq, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // 시나리오 선택 변화 → &scenario={id} URL 동기화
  const handleScenarioChange = useCallback((id: string | null) => {
    if (loading) return
    syncUrl({ scenario: id })
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectRequirement = (req: ReqWithResult) => {
    setSelectedReq(req)
    if (activeTab === 'dashboard' || activeTab === 'backlog') {
      setActiveTab('requirements')
      syncTabUrl('requirements')
    }
    // 'issues' 탭에서는 탭 전환 없이 사이드패널만 열림
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">로딩 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold text-gray-900">도매랑 QA</h1>
            <span className="text-xs text-gray-400 hidden sm:block">품질 검증 대시보드</span>
          </div>
          <div className="flex items-center gap-2">
            <CycleSelector
              cycles={cycles}
              selectedId={selectedCycleId}
              onSelect={setSelectedCycleId}
              onCycleCreated={cycle => setCycles(prev => [...prev, cycle])}
            />
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="h-8">
              <Plus className="h-3.5 w-3.5 mr-1" />
              신규 추가
            </Button>
            <Button size="sm" onClick={() => setUploadOpen(true)} className="h-8">
              <Upload className="h-3.5 w-3.5 mr-1" />
              업로드
            </Button>
          </div>
        </div>
      </header>

      {/* 탭 + 컨텐츠 */}
      <main className="max-w-7xl mx-auto px-4 py-5">
        <Tabs value={activeTab} onValueChange={(tab) => {
            setActiveTab(tab)
            const params = new URLSearchParams(window.location.search)
            params.set('tab', tab)
            window.history.replaceState(null, '', `?${params.toString()}`)
            if (tab === 'issues') refresh()
          }}>
          <TabsList className="mb-5">
            <TabsTrigger value="dashboard">대시보드</TabsTrigger>
            <TabsTrigger value="requirements">요구사항</TabsTrigger>
            <TabsTrigger value="backlog">백로그</TabsTrigger>
            <TabsTrigger value="issues">이슈</TabsTrigger>
            <TabsTrigger value="scenarios">시나리오</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <DashboardTab
              cycleId={selectedCycleId}
              cycle={selectedCycle}
              onSelectRequirement={handleSelectRequirement}
              refreshKey={refreshKey}
            />
          </TabsContent>

          <TabsContent value="requirements">
            <RequirementsTab
              cycleId={selectedCycleId}
              systems={systems}
              onSelectRequirement={req => setSelectedReq(req)}
              selectedId={selectedReq?.id ?? null}
              refreshKey={refreshKey}
              onRefresh={refresh}
            />
          </TabsContent>

          <TabsContent value="backlog">
            <BacklogTab
              cycleId={selectedCycleId}
              systems={systems}
              onSelectRequirement={handleSelectRequirement}
              refreshKey={refreshKey}
            />
          </TabsContent>

          <TabsContent value="issues">
            <IssueTab
              cycleId={selectedCycleId}
              systems={systems}
              onSelectRequirement={handleSelectRequirement}
              onSelectScenario={(scenarioId) => {
                setScenarioPanelId(scenarioId)
              }}
              refreshKey={refreshKey}
            />
          </TabsContent>
          <TabsContent value="scenarios">
            <ScenarioTab
              cycleId={selectedCycleId}
              systems={systems}
              onSelectRequirement={handleSelectRequirement}
              refreshKey={refreshKey}
              initialScenarioId={selectedScenarioId}
              onGlobalRefresh={refresh}
              onScenarioChange={handleScenarioChange}
            />
          </TabsContent>
        </Tabs>
      </main>

      {/* 요구사항 사이드 패널 */}
      <SidePanel
        requirement={selectedReq}
        cycleId={selectedCycleId}
        systems={systems}
        onClose={() => setSelectedReq(null)}
        onUpdate={refresh}
        onNavigate={req => setSelectedReq(req)}
      />

      {/* 시나리오 사이드 패널 (이슈 탭에서 클릭 시) */}
      <ScenarioSidePanel
        scenarioId={scenarioPanelId}
        cycleId={selectedCycleId}
        onClose={() => setScenarioPanelId(null)}
        onOpenFull={(id) => {
          setScenarioPanelId(null)
          setSelectedScenarioId(id)
          setActiveTab('scenarios')
          syncTabUrl('scenarios')
        }}
      />

      {/* 업로드 모달 */}
      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        systems={systems}
        onSuccess={refresh}
      />

      {/* 신규 추가 모달 */}
      <AddRequirementModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        systems={systems}
        onSuccess={refresh}
      />
    </div>
  )
}
