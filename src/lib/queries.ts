import { supabase } from './supabase'
import type { Requirement, System, TestCycle, TestResult, TestStatus, StatusCount, SystemStats, RequirementChange, IssueItem, TestScenario, ScenarioRequirement, ScenarioResult } from './types'

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
  issueRaisedCount: number
  issueFixedCount: number
}

export async function getIssueStats(cycleId: string): Promise<IssueStats> {
  const { data } = await supabase
    .from('test_results')
    .select('status, issue_raised, issue_fixed')
    .eq('cycle_id', cycleId)
    .in('status', ['Fail', 'Block'])

  const rows = data ?? []
  return {
    failCount: rows.filter(r => r.status === 'Fail').length,
    blockCount: rows.filter(r => r.status === 'Block').length,
    issueRaisedCount: rows.filter(r => r.issue_raised).length,
    issueFixedCount: rows.filter(r => r.issue_fixed).length,
  }
}

// ─── Test Scenarios ───────────────────────────────────────────────────────────

export type ScenarioWithMeta = TestScenario & {
  result?: ScenarioResult
  reqCount: number
}

export async function getScenarios(
  cycleId: string,
  filters?: { scenarioType?: string; search?: string; status?: string }
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

  const { data, error } = await query
  if (error) throw error

  return ((data ?? []) as any[]).map(row => ({
    ...row,
    reqCount: (row.scenario_requirements ?? []).length,
    result: (row.scenario_results ?? []).find((r: any) => r.cycle_id === cycleId),
    scenario_requirements: undefined,
    scenario_results: undefined,
  }))
}

export type ScenarioDetail = TestScenario & {
  linkedRequirements: (ScenarioRequirement & {
    requirement: Requirement & { systems?: System }
  })[]
  result?: ScenarioResult
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

  return {
    ...row,
    linkedRequirements,
    result: (row.scenario_results ?? []).find((r: any) => r.cycle_id === cycleId),
    scenario_requirements: undefined,
    scenario_results: undefined,
  }
}

export async function createScenario(data: {
  title: string
  scenario_type: string
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
