import { supabase } from './supabase'
import type { Requirement, System, TestCycle, TestResult, TestStatus, StatusCount, SystemStats, RequirementChange, IssueItem, TestScenario, ScenarioRequirement, ScenarioResult, ScenarioType } from './types'

// ─── Systems ────────────────────────────────────────────────────────────────

export async function getSystems(): Promise<System[]> {
  const { data, error } = await supabase
    .from('systems')
    .select('*')
    .order('created_at')
  if (error) throw error
  return data ?? []
}

// ─── Test Cycles ─────────────────────────────────────────────────────────────

export async function getTestCycles(): Promise<TestCycle[]> {
  const { data, error } = await supabase
    .from('test_cycles')
    .select('*')
    .order('created_at')
  if (error) throw error
  return data ?? []
}

export async function createTestCycle(name: string): Promise<TestCycle> {
  const { data, error } = await supabase
    .from('test_cycles')
    .insert({ name, started_at: new Date().toISOString() })
    .select()
    .single()
  if (error) throw error
  return data
}

// ─── Requirements ─────────────────────────────────────────────────────────────

export async function getRequirements(filters?: {
  systemId?: string
  search?: string
}): Promise<Requirement[]> {
  let query = supabase
    .from('requirements')
    .select('*, systems(id, name)')
    .order('created_at')

  if (filters?.systemId && filters.systemId !== 'all') {
    query = query.eq('system_id', filters.systemId)
  }
  if (filters?.search) {
    query = query.or(
      `feature_name.ilike.%${filters.search}%,depth_0.ilike.%${filters.search}%,depth_1.ilike.%${filters.search}%,depth_2.ilike.%${filters.search}%,original_spec.ilike.%${filters.search}%`
    )
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Requirement[]
}

// depth 계층 값 목록 조회 (cascade 필터용)
export async function getDepthValues(systemIds?: string[]): Promise<{
  depth_0: string[]
  depth_1ByParent: Record<string, string[]>
  depth_2ByParent: Record<string, string[]>
}> {
  let query = supabase
    .from('requirements')
    .select('depth_0, depth_1, depth_2')

  if (systemIds && systemIds.length > 0) {
    query = query.in('system_id', systemIds)
  }

  const { data } = await query
  const rows = data ?? []

  const depth_0 = [...new Set(rows.map(r => r.depth_0).filter(Boolean) as string[])].sort()

  const depth_1ByParent: Record<string, string[]> = {}
  for (const row of rows) {
    if (!row.depth_0 || !row.depth_1) continue
    if (!depth_1ByParent[row.depth_0]) depth_1ByParent[row.depth_0] = []
    if (!depth_1ByParent[row.depth_0].includes(row.depth_1)) {
      depth_1ByParent[row.depth_0].push(row.depth_1)
    }
  }
  for (const key of Object.keys(depth_1ByParent)) {
    depth_1ByParent[key].sort()
  }

  const depth_2ByParent: Record<string, string[]> = {}
  for (const row of rows) {
    if (!row.depth_1 || !row.depth_2) continue
    if (!depth_2ByParent[row.depth_1]) depth_2ByParent[row.depth_1] = []
    if (!depth_2ByParent[row.depth_1].includes(row.depth_2)) {
      depth_2ByParent[row.depth_1].push(row.depth_2)
    }
  }
  for (const key of Object.keys(depth_2ByParent)) {
    depth_2ByParent[key].sort()
  }

  return { depth_0, depth_1ByParent, depth_2ByParent }
}

export async function getRequirementsWithResults(cycleId: string, filters?: {
  systemIds?: string[]
  search?: string
  statusFilter?: string
  scenarioFilter?: string
  priorityFilter?: string
  depth0?: string[]
  depth1?: string[]
  depth2?: string[]
}): Promise<(Requirement & { currentResult?: TestResult })[]> {
  let query = supabase
    .from('requirements')
    .select(`*, systems(id, name), test_results(*)`)
    .order('created_at')

  if (filters?.systemIds && filters.systemIds.length > 0) {
    query = query.in('system_id', filters.systemIds)
  }
  if (filters?.depth0 && filters.depth0.length > 0) {
    query = query.in('depth_0', filters.depth0)
  }
  if (filters?.depth1 && filters.depth1.length > 0) {
    query = query.in('depth_1', filters.depth1)
  }
  if (filters?.depth2 && filters.depth2.length > 0) {
    query = query.in('depth_2', filters.depth2)
  }
  if (filters?.search) {
    query = query.or(
      `feature_name.ilike.%${filters.search}%,depth_0.ilike.%${filters.search}%,depth_1.ilike.%${filters.search}%,depth_2.ilike.%${filters.search}%,original_spec.ilike.%${filters.search}%`
    )
  }

  const { data, error } = await query
  if (error) throw error

  const reqs = (data ?? []) as (Requirement & { test_results: TestResult[] })[]
  let result = reqs.map(req => ({
    ...req,
    currentResult: req.test_results?.find(r => r.cycle_id === cycleId),
  }))

  if (filters?.statusFilter && filters.statusFilter !== 'all') {
    result = result.filter(r => {
      const status = r.currentResult?.status ?? '미테스트'
      return status === filters.statusFilter
    })
  }

  if (filters?.scenarioFilter === 'has') {
    result = result.filter(r => r.precondition || r.test_steps || r.expected_result)
  } else if (filters?.scenarioFilter === 'none') {
    result = result.filter(r => !r.precondition && !r.test_steps && !r.expected_result)
  }

  if (filters?.priorityFilter === 'none') {
    result = result.filter(r => !r.priority)
  } else if (filters?.priorityFilter) {
    result = result.filter(r => r.priority === filters.priorityFilter)
  }

  return result
}

export async function createRequirement(data: {
  system_id: string
  depth_0?: string
  depth_1?: string
  depth_2?: string
  depth_3?: string
  feature_name?: string
  original_spec?: string
  priority?: string
}): Promise<Requirement> {
  const { data: created, error } = await supabase
    .from('requirements')
    .insert(data)
    .select()
    .single()
  if (error) throw error
  return created as Requirement
}

export async function bulkCreateRequirements(items: Array<{
  system_id: string
  depth_0?: string
  depth_1?: string
  depth_2?: string
  depth_3?: string
  feature_name?: string
  original_spec?: string
}>): Promise<number> {
  const { data, error } = await supabase
    .from('requirements')
    .insert(items)
    .select('id')
  if (error) throw error
  return data?.length ?? 0
}

export async function updateRequirement(
  id: string,
  updates: Partial<Omit<Requirement, 'id' | 'created_at' | 'display_id' | 'systems' | 'test_results'>>
): Promise<void> {
  const { error } = await supabase
    .from('requirements')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function searchRequirementsForRelated(
  query: string,
  excludeId?: string
): Promise<Array<Pick<Requirement, 'id' | 'display_id' | 'feature_name' | 'depth_0' | 'depth_1' | 'systems'>>> {
  if (!query.trim()) return []
  const numQuery = parseInt(query)
  let q = supabase
    .from('requirements')
    .select('id, display_id, feature_name, depth_0, depth_1, systems(id, name)')
    .limit(8)
  if (!isNaN(numQuery)) {
    q = q.or(`feature_name.ilike.%${query}%,display_id.eq.${numQuery}`)
  } else {
    q = q.or(`feature_name.ilike.%${query}%,depth_0.ilike.%${query}%,depth_1.ilike.%${query}%`)
  }
  if (excludeId) q = q.neq('id', excludeId)
  const { data } = await q
  return (data ?? []) as unknown as Array<Pick<Requirement, 'id' | 'display_id' | 'feature_name' | 'depth_0' | 'depth_1' | 'systems'>>
}

export async function getRequirementNamesByDisplayIds(
  displayIds: number[]
): Promise<Record<number, { name: string; systemName: string }>> {
  if (displayIds.length === 0) return {}
  const { data } = await supabase
    .from('requirements')
    .select('display_id, feature_name, systems(id, name)')
    .in('display_id', displayIds)
  const map: Record<number, { name: string; systemName: string }> = {}
  for (const r of (data ?? []) as any[]) {
    if (r.display_id != null) {
      map[r.display_id] = { name: r.feature_name ?? '', systemName: r.systems?.name ?? '' }
    }
  }
  return map
}

export async function getRequirementByDisplayId(
  displayId: number,
  cycleId: string
): Promise<(Requirement & { currentResult?: TestResult }) | null> {
  const { data, error } = await supabase
    .from('requirements')
    .select('*, systems(id, name), test_results(*)')
    .eq('display_id', displayId)
    .single()
  if (error || !data) return null
  const req = data as Requirement & { test_results: TestResult[] }
  return {
    ...req,
    currentResult: req.test_results?.find(r => r.cycle_id === cycleId),
  }
}

export async function deleteRequirements(ids: string[]): Promise<void> {
  // URL 길이 한도 초과 방지: 100개씩 나눠서 삭제
  const CHUNK = 100
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('requirements')
      .delete()
      .in('id', chunk)
    if (error) throw error
  }
}

// ─── Test Results ─────────────────────────────────────────────────────────────

// ─── Change History ──────────────────────────────────────────────────────────

export async function logChange(data: {
  requirement_id: string
  changed_field: string
  old_value?: string | null
  new_value?: string | null
  change_reason?: string | null
}): Promise<void> {
  try {
    await supabase.from('requirement_changes').insert({
      requirement_id: data.requirement_id,
      changed_field: data.changed_field,
      old_value: data.old_value ?? null,
      new_value: data.new_value ?? null,
      change_reason: data.change_reason ?? null,
    })
  } catch {
    // 이력 로깅 실패는 무시 (메인 플로우 방해 안 함)
  }
}

export async function getChangeHistory(requirementId: string, limit = 20): Promise<RequirementChange[]> {
  const { data } = await supabase
    .from('requirement_changes')
    .select('*')
    .eq('requirement_id', requirementId)
    .order('changed_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function upsertTestResult(data: {
  requirement_id: string
  cycle_id: string
  status: TestStatus
  tester?: string
  issue_raised?: boolean
  issue_fixed?: boolean
  issue_items?: IssueItem[]
  retest_reason?: string | null
  note?: string
}): Promise<TestResult> {
  const { data: result, error } = await supabase
    .from('test_results')
    .upsert(
      { ...data, tested_at: new Date().toISOString() },
      { onConflict: 'requirement_id,cycle_id' }
    )
    .select()
    .single()
  if (error) throw error
  return result as TestResult
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getDashboardStats(cycleId: string): Promise<{
  total: StatusCount
  bySystem: SystemStats[]
}> {
  const [{ data: requirements }, { data: results }, { data: systems }] = await Promise.all([
    supabase.from('requirements').select('id, system_id'),
    supabase.from('test_results').select('requirement_id, cycle_id, status').eq('cycle_id', cycleId),
    supabase.from('systems').select('*').order('created_at'),
  ])

  const reqList = requirements ?? []
  const resultList = results ?? []
  const systemList = (systems ?? []) as System[]

  const getStatus = (reqId: string): TestStatus => {
    const r = resultList.find(r => r.requirement_id === reqId)
    return (r?.status as TestStatus) ?? '미테스트'
  }

  const countStatuses = (reqs: { id: string }[]): StatusCount => {
    const counts: StatusCount = { Pass: 0, Fail: 0, Block: 0, 'In Progress': 0, '미테스트': 0, total: reqs.length }
    for (const req of reqs) {
      const s = getStatus(req.id)
      counts[s]++
    }
    return counts
  }

  const total = countStatuses(reqList)

  const bySystem: SystemStats[] = systemList.map(system => {
    const sysReqs = reqList.filter(r => r.system_id === system.id)
    const counts = countStatuses(sysReqs)
    const done = counts.Pass + counts.Fail + counts.Block + counts['In Progress']
    const progressRate = counts.total > 0 ? Math.round((done / counts.total) * 100) : 0
    return { system, counts, progressRate }
  })

  return { total, bySystem }
}

export interface DepthGroupStat {
  systemId: string
  systemName: string
  depth_0: string
  counts: StatusCount
  progressRate: number
}

export async function getDepthGroupStats(cycleId: string): Promise<DepthGroupStat[]> {
  const [{ data: requirements }, { data: results }, { data: systems }] = await Promise.all([
    supabase.from('requirements').select('id, system_id, depth_0'),
    supabase.from('test_results').select('requirement_id, status').eq('cycle_id', cycleId),
    supabase.from('systems').select('*').order('created_at'),
  ])

  const reqList = requirements ?? []
  const resultList = results ?? []
  const systemList = systems ?? []

  const getStatus = (reqId: string): TestStatus => {
    const r = resultList.find(r => r.requirement_id === reqId)
    return (r?.status as TestStatus) ?? '미테스트'
  }

  // system_id + depth_0 조합으로 그룹핑
  const groups: Record<string, { systemId: string; systemName: string; depth_0: string; ids: string[] }> = {}
  for (const req of reqList) {
    const sys = systemList.find(s => s.id === req.system_id)
    if (!req.depth_0 || !sys) continue
    const key = `${req.system_id}__${req.depth_0}`
    if (!groups[key]) groups[key] = { systemId: req.system_id, systemName: sys.name, depth_0: req.depth_0, ids: [] }
    groups[key].ids.push(req.id)
  }

  return Object.values(groups).map(({ systemId, systemName, depth_0, ids }) => {
    const counts: StatusCount = { Pass: 0, Fail: 0, Block: 0, 'In Progress': 0, '미테스트': 0, total: ids.length }
    for (const id of ids) counts[getStatus(id)]++
    const done = counts.Pass + counts.Fail + counts.Block + counts['In Progress']
    const progressRate = counts.total > 0 ? Math.round((done / counts.total) * 100) : 0
    return { systemId, systemName, depth_0, counts, progressRate }
  })
}

export interface IssueStats {
  failCount: number
  blockCount: number
  issueRaisedCount: number   // 요구사항 단위로 전체 라이징 완료된 건수
  issueFixedCount: number    // 요구사항 단위로 전체 수정 완료된 건수
  itemsTotal: number         // 이슈 항목 총 개수
  itemsRaised: number        // 라이징된 항목 수
  itemsFixed: number         // 수정 완료된 항목 수
}

export async function getIssueStats(cycleId: string): Promise<IssueStats> {
  const { data } = await supabase
    .from('test_results')
    .select('status, issue_raised, issue_fixed, issue_items')
    .eq('cycle_id', cycleId)
    .in('status', ['Fail', 'Block'])

  const rows = data ?? []
  let itemsTotal = 0, itemsRaised = 0, itemsFixed = 0
  for (const r of rows) {
    const items = (r.issue_items ?? []) as IssueItem[]
    itemsTotal += items.length
    itemsRaised += items.filter(i => i.raised).length
    itemsFixed += items.filter(i => i.fixed).length
  }
  return {
    failCount: rows.filter(r => r.status === 'Fail').length,
    blockCount: rows.filter(r => r.status === 'Block').length,
    issueRaisedCount: rows.filter(r => r.issue_raised).length,
    issueFixedCount: rows.filter(r => r.issue_fixed).length,
    itemsTotal,
    itemsRaised,
    itemsFixed,
  }
}

export interface ScenarioIssueStats {
  failCount: number
  blockCount: number
  itemsTotal: number
  itemsRaised: number
  itemsFixed: number
}

export async function getScenarioIssueStats(cycleId: string): Promise<ScenarioIssueStats> {
  const { data } = await supabase
    .from('scenario_results')
    .select('status, issue_items')
    .eq('cycle_id', cycleId)
    .in('status', ['Fail', 'Block'])

  const rows = data ?? []
  let itemsTotal = 0, itemsRaised = 0, itemsFixed = 0
  for (const r of rows) {
    const items = (r.issue_items ?? []) as IssueItem[]
    itemsTotal += items.length
    itemsRaised += items.filter(i => i.raised).length
    itemsFixed += items.filter(i => i.fixed).length
  }
  return {
    failCount: rows.filter(r => r.status === 'Fail').length,
    blockCount: rows.filter(r => r.status === 'Block').length,
    itemsTotal,
    itemsRaised,
    itemsFixed,
  }
}

// ─── Scenario Stats ───────────────────────────────────────────────────────────

export interface ScenarioStats {
  total: number
  byStatus: Record<string, number>
  progressRate: number
  byType: { type: string; label: string; total: number; byStatus: Record<string, number> }[]
}

export async function getScenarioStats(cycleId: string): Promise<ScenarioStats> {
  const [{ data: scenarios }, { data: results }] = await Promise.all([
    supabase.from('test_scenarios').select('id, scenario_type').eq('status', 'active'),
    supabase.from('scenario_results').select('scenario_id, status').eq('cycle_id', cycleId),
  ])

  const scenarioList = scenarios ?? []
  const resultMap = new Map((results ?? []).map(r => [r.scenario_id, r.status as string]))

  const emptyByStatus = () => ({ Pass: 0, Fail: 0, Block: 0, 'In Progress': 0, '미테스트': 0 } as Record<string, number>)

  const total = emptyByStatus()
  const byType: Record<string, Record<string, number>> = {
    integration: emptyByStatus(),
    unit: emptyByStatus(),
    e2e: emptyByStatus(),
  }

  for (const s of scenarioList) {
    const status = resultMap.get(s.id) ?? '미테스트'
    total[status] = (total[status] ?? 0) + 1
    const t = byType[s.scenario_type]
    if (t) t[status] = (t[status] ?? 0) + 1
  }

  const totalCount = scenarioList.length
  const done = (total.Pass ?? 0) + (total.Fail ?? 0) + (total.Block ?? 0) + (total['In Progress'] ?? 0)
  const TYPE_LABELS: Record<string, string> = { integration: '통합', unit: '단위', e2e: 'E2E' }

  return {
    total: totalCount,
    byStatus: total,
    progressRate: totalCount > 0 ? Math.round((done / totalCount) * 100) : 0,
    byType: ['integration', 'unit', 'e2e']
      .map(type => ({
        type,
        label: TYPE_LABELS[type],
        total: Object.values(byType[type]).reduce((a, b) => a + b, 0),
        byStatus: byType[type],
      }))
      .filter(t => t.total > 0),
  }
}

// ─── Test Scenarios ───────────────────────────────────────────────────────────

export type ScenarioWithMeta = TestScenario & {
  result?: ScenarioResult
  reqCount: number
  parentE2Es?: { id: string; title: string; orderIndex: number }[]
  childCount?: number
}

export async function getScenarios(
  cycleId: string,
  filters?: { scenarioType?: string; search?: string; status?: string; systemId?: string }
): Promise<ScenarioWithMeta[]> {
  let query = supabase
    .from('test_scenarios')
    .select('*, scenario_requirements(id), scenario_results(*)')
    .order('created_at', { ascending: false })

  if (filters?.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }
  if (filters?.scenarioType && filters.scenarioType !== 'all') {
    query = query.eq('scenario_type', filters.scenarioType)
  }
  if (filters?.search) {
    query = query.ilike('title', `%${filters.search}%`)
  }
  if (filters?.systemId && filters.systemId !== 'all') {
    query = query.contains('system_ids', JSON.stringify([filters.systemId]))
  }

  const { data, error } = await query
  if (error) throw error

  const scenarios: ScenarioWithMeta[] = ((data ?? []) as any[]).map(row => ({
    ...row,
    reqCount: (row.scenario_requirements ?? []).length,
    result: (row.scenario_results ?? []).find((r: any) => r.cycle_id === cycleId),
    scenario_requirements: undefined,
    scenario_results: undefined,
    parentE2Es: [],
    childCount: 0,
  }))

  if (scenarios.length === 0) return scenarios

  // Enrich with composition data
  const integrationIds = scenarios.filter(s => s.scenario_type === 'integration').map(s => s.id)
  const e2eIds = scenarios.filter(s => s.scenario_type === 'e2e').map(s => s.id)

  const [parentCompsResult, childCompsResult] = await Promise.all([
    integrationIds.length > 0
      ? supabase.from('scenario_compositions').select('child_id, parent_id, order_index').in('child_id', integrationIds)
      : { data: [] as any[], error: null },
    e2eIds.length > 0
      ? supabase.from('scenario_compositions').select('parent_id').in('parent_id', e2eIds)
      : { data: [] as any[], error: null },
  ])

  const parentComps = (parentCompsResult.data ?? []) as any[]
  const childComps = (childCompsResult.data ?? []) as any[]

  // Fetch parent E2E titles
  const uniqueParentIds = [...new Set(parentComps.map((c: any) => c.parent_id as string))]
  const parentTitleMap: Record<string, string> = {}
  if (uniqueParentIds.length > 0) {
    const { data: parents } = await supabase.from('test_scenarios').select('id, title').in('id', uniqueParentIds)
    for (const p of (parents ?? []) as any[]) parentTitleMap[p.id] = p.title
  }

  // Build parentE2Es map
  const parentE2EsMap: Record<string, { id: string; title: string; orderIndex: number }[]> = {}
  for (const c of parentComps) {
    if (!parentE2EsMap[c.child_id]) parentE2EsMap[c.child_id] = []
    parentE2EsMap[c.child_id].push({ id: c.parent_id, title: parentTitleMap[c.parent_id] ?? '', orderIndex: c.order_index })
  }
  // Sort each parent list by orderIndex
  for (const arr of Object.values(parentE2EsMap)) arr.sort((a, b) => a.orderIndex - b.orderIndex)

  // Build childCount map
  const childCountMap: Record<string, number> = {}
  for (const c of childComps) {
    childCountMap[c.parent_id] = (childCountMap[c.parent_id] ?? 0) + 1
  }

  return scenarios.map(s => ({
    ...s,
    parentE2Es: parentE2EsMap[s.id] ?? [],
    childCount: childCountMap[s.id] ?? 0,
  }))
}

export type ScenarioDetail = TestScenario & {
  linkedRequirements: (ScenarioRequirement & {
    requirement: Requirement & { systems?: System }
  })[]
  result?: ScenarioResult
  parentE2Es?: { id: string; title: string; orderIndex: number }[]
  childScenarios?: { id: string; title: string; orderIndex: number; result?: ScenarioResult }[]
}

export async function getScenarioDetail(
  id: string,
  cycleId: string
): Promise<ScenarioDetail | null> {
  const { data, error } = await supabase
    .from('test_scenarios')
    .select(`
      *,
      scenario_requirements(*, requirements(*, systems(id, name))),
      scenario_results(*)
    `)
    .eq('id', id)
    .single()

  if (error || !data) return null

  const row = data as any
  const linkedRequirements = (row.scenario_requirements ?? [])
    .sort((a: any, b: any) => a.order_index - b.order_index)
    .map((sr: any) => ({
      id: sr.id,
      scenario_id: sr.scenario_id,
      requirement_id: sr.requirement_id,
      order_index: sr.order_index,
      verify_note: sr.verify_note ?? null,
      requirement: sr.requirements as Requirement & { systems?: System },
    }))

  const base = {
    ...row,
    linkedRequirements,
    result: (row.scenario_results ?? []).find((r: any) => r.cycle_id === cycleId),
    scenario_requirements: undefined,
    scenario_results: undefined,
  }

  if (row.scenario_type === 'integration') {
    const { data: comps } = await supabase
      .from('scenario_compositions')
      .select('parent_id, order_index')
      .eq('child_id', id)
      .order('order_index')
    const parentIds = (comps ?? []).map((c: any) => c.parent_id as string)
    let parentE2Es: { id: string; title: string; orderIndex: number }[] = []
    if (parentIds.length > 0) {
      const { data: parents } = await supabase.from('test_scenarios').select('id, title').in('id', parentIds)
      const titleMap: Record<string, string> = {}
      for (const p of (parents ?? []) as any[]) titleMap[p.id] = p.title
      parentE2Es = (comps ?? []).map((c: any) => ({
        id: c.parent_id,
        title: titleMap[c.parent_id] ?? '',
        orderIndex: c.order_index,
      }))
    }
    return { ...base, parentE2Es }
  }

  if (row.scenario_type === 'e2e') {
    const { data: comps } = await supabase
      .from('scenario_compositions')
      .select('child_id, order_index')
      .eq('parent_id', id)
      .order('order_index')
    const childIds = (comps ?? []).map((c: any) => c.child_id as string)
    let childScenarios: { id: string; title: string; orderIndex: number; result?: ScenarioResult }[] = []
    if (childIds.length > 0) {
      const [{ data: children }, { data: childResults }] = await Promise.all([
        supabase.from('test_scenarios').select('id, title').in('id', childIds),
        supabase.from('scenario_results').select('*').eq('cycle_id', cycleId).in('scenario_id', childIds),
      ])
      const titleMap: Record<string, string> = {}
      for (const c of (children ?? []) as any[]) titleMap[c.id] = c.title
      const resultMap = new Map((childResults ?? []).map((r: any) => [r.scenario_id, r as ScenarioResult]))
      childScenarios = (comps ?? []).map((c: any) => ({
        id: c.child_id,
        title: titleMap[c.child_id] ?? '',
        orderIndex: c.order_index,
        result: resultMap.get(c.child_id),
      }))
    }
    return { ...base, childScenarios }
  }

  return base
}

export async function createScenario(data: {
  title: string
  scenario_type: string
  system_ids?: string[]
  business_context?: string | null
  precondition?: string | null
  steps?: string
  expected_result?: string
  status?: string
  ai_generated?: boolean
}): Promise<TestScenario> {
  const { data: created, error } = await supabase
    .from('test_scenarios')
    .insert(data)
    .select()
    .single()
  if (error) throw error
  return created as TestScenario
}

export async function updateScenario(
  id: string,
  data: Partial<Omit<TestScenario, 'id' | 'created_at' | 'updated_at'>>
): Promise<void> {
  const { error } = await supabase
    .from('test_scenarios')
    .update(data)
    .eq('id', id)
  if (error) throw error
}

export async function deleteScenario(id: string): Promise<void> {
  const { error } = await supabase
    .from('test_scenarios')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function setScenarioRequirements(
  scenarioId: string,
  items: Array<{ requirement_id: string; order_index: number; verify_note?: string }>
): Promise<void> {
  const { error: delError } = await supabase
    .from('scenario_requirements')
    .delete()
    .eq('scenario_id', scenarioId)
  if (delError) throw delError

  if (items.length === 0) return

  const { error: insError } = await supabase
    .from('scenario_requirements')
    .insert(items.map(item => ({ ...item, scenario_id: scenarioId })))
  if (insError) throw insError
}

// 시나리오 타입별 제목 검색 (피커용)
export async function searchScenarios(
  query: string,
  type: ScenarioType,
  limit = 20
): Promise<{ id: string; title: string }[]> {
  let q = supabase
    .from('test_scenarios')
    .select('id, title')
    .eq('scenario_type', type)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (query.trim()) {
    q = q.ilike('title', `%${query}%`)
  }
  const { data } = await q
  return (data ?? []) as { id: string; title: string }[]
}

export async function getE2EScenariosForPicker(): Promise<{ id: string; title: string }[]> {
  const { data, error } = await supabase
    .from('test_scenarios')
    .select('id, title')
    .eq('scenario_type', 'e2e')
    .eq('status', 'active')
    .order('created_at')
  if (error) throw error
  return (data ?? []) as { id: string; title: string }[]
}

// 통합 시나리오 기준: 속한 E2E 목록 일괄 갱신 (child 입장)
export async function setScenarioCompositions(
  childId: string,
  items: Array<{ parent_id: string; order_index: number }>
): Promise<void> {
  const { error: delError } = await supabase
    .from('scenario_compositions')
    .delete()
    .eq('child_id', childId)
  if (delError) throw delError
  if (items.length === 0) return
  const { error: insError } = await supabase
    .from('scenario_compositions')
    .insert(items.map(item => ({ child_id: childId, parent_id: item.parent_id, order_index: item.order_index })))
  if (insError) throw insError
}

// E2E 시나리오 기준: 포함된 통합 시나리오 목록 일괄 갱신 (parent 입장)
export async function setScenarioCompositionsFromParent(
  parentId: string,
  items: Array<{ child_id: string; order_index: number }>
): Promise<void> {
  const { error: delError } = await supabase
    .from('scenario_compositions')
    .delete()
    .eq('parent_id', parentId)
  if (delError) throw delError
  if (items.length === 0) return
  const { error: insError } = await supabase
    .from('scenario_compositions')
    .insert(items.map(item => ({ parent_id: parentId, child_id: item.child_id, order_index: item.order_index })))
  if (insError) throw insError
}

export async function upsertScenarioResult(data: {
  scenario_id: string
  cycle_id: string
  status: TestStatus
  tester?: string
  note?: string
  issue_items?: IssueItem[]
}): Promise<ScenarioResult> {
  const { data: result, error } = await supabase
    .from('scenario_results')
    .upsert(
      { ...data, tested_at: new Date().toISOString() },
      { onConflict: 'scenario_id,cycle_id' }
    )
    .select()
    .single()
  if (error) throw error
  return result as ScenarioResult
}

export async function getRequirementsByIds(ids: string[]): Promise<(Requirement & { systems?: System })[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('requirements')
    .select('id, display_id, feature_name, depth_0, depth_1, original_spec, current_policy, systems(id, name)')
    .in('id', ids)
  if (error) throw error
  return (data ?? []) as unknown as (Requirement & { systems?: System })[]
}

export async function getNextRecommended(cycleId: string, limit = 5): Promise<Requirement[]> {
  const { data: results } = await supabase
    .from('test_results')
    .select('requirement_id')
    .eq('cycle_id', cycleId)
    .neq('status', '미테스트')

  const testedIds = (results ?? []).map(r => r.requirement_id)

  let query = supabase
    .from('requirements')
    .select('*, systems(id, name)')
    .order('created_at')
    .limit(limit)

  if (testedIds.length > 0) {
    query = query.not('id', 'in', `(${testedIds.join(',')})`)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Requirement[]
}
