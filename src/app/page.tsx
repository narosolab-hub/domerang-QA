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
import { SidePanel } from '@/components/SidePanel'
import { UploadModal } from '@/components/UploadModal'
import { AddRequirementModal } from '@/components/AddRequirementModal'
import { getSystems, getTestCycles } from '@/lib/queries'
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
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => setRefreshKey(k => k + 1), [])

  useEffect(() => {
    Promise.all([getSystems(), getTestCycles()]).then(([s, c]) => {
      setSystems(s)
      setCycles(c)
      if (c.length > 0) setSelectedCycleId(c[c.length - 1].id)
    }).finally(() => setLoading(false))
  }, [])

  const selectedCycle = cycles.find(c => c.id === selectedCycleId) ?? null

  const handleSelectRequirement = (req: ReqWithResult) => {
    setSelectedReq(req)
    if (activeTab === 'dashboard' || activeTab === 'backlog') {
      setActiveTab('requirements')
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
        <Tabs value={activeTab} onValueChange={setActiveTab}>
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
              refreshKey={refreshKey}
            />
          </TabsContent>
          <TabsContent value="scenarios">
            <ScenarioTab
              cycleId={selectedCycleId}
              systems={systems}
              onSelectRequirement={handleSelectRequirement}
              refreshKey={refreshKey}
            />
          </TabsContent>
        </Tabs>
      </main>

      {/* 사이드 패널 */}
      <SidePanel
        requirement={selectedReq}
        cycleId={selectedCycleId}
        systems={systems}
        onClose={() => setSelectedReq(null)}
        onUpdate={refresh}
        onNavigate={req => setSelectedReq(req)}
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
