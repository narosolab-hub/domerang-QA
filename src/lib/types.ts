export type TestStatus = 'Pass' | 'Fail' | 'Block' | 'In Progress' | '미테스트'
export type Priority = '높음' | '중간' | '낮음'

export interface IssueItem {
  text: string
  raised: boolean
  fixed: boolean
}

export interface System {
  id: string
  name: string
  created_at: string
}

export interface Requirement {
  id: string
  system_id: string
  depth_0: string | null
  depth_1: string | null
  depth_2: string | null
  depth_3: string | null
  feature_name: string | null
  original_spec: string | null
  current_policy: string | null
  policy_updated_at: string | null
  policy_note: string | null
  precondition: string | null
  test_steps: string | null
  expected_result: string | null
  priority: Priority | null
  display_id: number | null
  related_ids: string | null
  scenario_link: string | null
  backlog_link: string | null
  created_at: string
  updated_at: string
  // joined
  systems?: System
  test_results?: TestResult[]
}

export interface TestCycle {
  id: string
  name: string
  started_at: string | null
  ended_at: string | null
  created_at: string
}

export interface TestResult {
  id: string
  requirement_id: string
  cycle_id: string
  status: TestStatus
  tester: string | null
  tested_at: string | null
  issue_ids: string | null
  issue_raised: boolean
  issue_fixed: boolean
  issue_items: IssueItem[]
  retest_reason: string | null
  note: string | null
  created_at: string
}

export interface RequirementChange {
  id: string
  requirement_id: string
  changed_field: string
  old_value: string | null
  new_value: string | null
  change_reason: string | null
  changed_at: string
}

// ── 시스템 색상 ──────────────────────────────────────────────────────────────

const SYSTEM_COLOR_MAP: Record<string, {
  badge: string        // 테이블 뱃지
  buttonBase: string   // 필터 버튼 비활성
  buttonActive: string // 필터 버튼 활성
  chip: string         // 관련 요구사항 칩 등
  tag: string          // 드롭다운 소형 태그
}> = {
  '쇼핑몰': {
    badge:        'bg-blue-100 text-blue-700 border border-blue-200',
    buttonBase:   'bg-blue-50 text-blue-600 border-blue-300 hover:bg-blue-100',
    buttonActive: 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700',
    chip:         'bg-blue-50 text-blue-700 border border-blue-200',
    tag:          'bg-blue-100 text-blue-600 border border-blue-200',
  },
  '공급사': {
    badge:        'bg-emerald-100 text-emerald-700 border border-emerald-200',
    buttonBase:   'bg-emerald-50 text-emerald-600 border-emerald-300 hover:bg-emerald-100',
    buttonActive: 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700',
    chip:         'bg-emerald-50 text-emerald-700 border border-emerald-200',
    tag:          'bg-emerald-100 text-emerald-600 border border-emerald-200',
  },
  '관리자': {
    badge:        'bg-purple-100 text-purple-700 border border-purple-200',
    buttonBase:   'bg-purple-50 text-purple-600 border-purple-300 hover:bg-purple-100',
    buttonActive: 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700',
    chip:         'bg-purple-50 text-purple-700 border border-purple-200',
    tag:          'bg-purple-100 text-purple-600 border border-purple-200',
  },
}

const SYSTEM_COLOR_DEFAULT = {
  badge:        'bg-gray-100 text-gray-600 border border-gray-200',
  buttonBase:   'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100',
  buttonActive: 'bg-gray-700 text-white border-gray-700',
  chip:         'bg-gray-50 text-gray-600 border border-gray-200',
  tag:          'bg-gray-100 text-gray-500 border border-gray-200',
}

export function getSystemColor(name: string | null | undefined) {
  return SYSTEM_COLOR_MAP[name ?? ''] ?? SYSTEM_COLOR_DEFAULT
}

// Supabase DB 타입 (createClient 제네릭용)
export type Database = {
  public: {
    Tables: {
      systems: { Row: System; Insert: Omit<System, 'id' | 'created_at'>; Update: Partial<Omit<System, 'id'>> }
      requirements: { Row: Requirement; Insert: Omit<Requirement, 'id' | 'created_at' | 'updated_at' | 'systems' | 'test_results'>; Update: Partial<Omit<Requirement, 'id' | 'created_at' | 'systems' | 'test_results'>> }
      test_cycles: { Row: TestCycle; Insert: Omit<TestCycle, 'id' | 'created_at'>; Update: Partial<Omit<TestCycle, 'id'>> }
      test_results: { Row: TestResult; Insert: Omit<TestResult, 'id' | 'created_at'>; Update: Partial<Omit<TestResult, 'id'>> }
      requirement_changes: { Row: RequirementChange; Insert: Omit<RequirementChange, 'id' | 'changed_at'>; Update: Partial<Omit<RequirementChange, 'id'>> }
    }
  }
}

// 통계 타입
export interface StatusCount {
  Pass: number
  Fail: number
  Block: number
  'In Progress': number
  '미테스트': number
  total: number
}

export interface SystemStats {
  system: System
  counts: StatusCount
  progressRate: number
}
