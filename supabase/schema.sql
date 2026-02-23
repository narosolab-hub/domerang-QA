-- ============================================
-- 도매랑 QA 대시보드 DB 스키마
-- Supabase SQL Editor에서 순서대로 실행하세요
-- ============================================

-- 1. systems (시스템)
CREATE TABLE systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. requirements (요구사항)
CREATE TABLE requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id uuid NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  depth_0 text,
  depth_1 text,
  depth_2 text,
  depth_3 text,
  feature_name text,
  original_spec text,
  current_policy text,
  policy_updated_at timestamptz,
  policy_note text,
  precondition text,
  test_steps text,
  expected_result text,
  scenario_link text,
  backlog_link text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. test_cycles (테스트 사이클)
CREATE TABLE test_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. test_results (테스트 결과)
CREATE TABLE test_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id uuid NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES test_cycles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT '미테스트'
    CHECK (status IN ('Pass', 'Fail', 'Block', 'In Progress', '미테스트')),
  tester text,
  tested_at timestamptz,
  issue_ids text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(requirement_id, cycle_id)
);

-- 5. requirement_changes (변경 이력)
CREATE TABLE requirement_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id uuid NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  changed_field text NOT NULL,
  old_value text,
  new_value text,
  change_reason text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- updated_at 자동 업데이트 트리거
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER requirements_updated_at
  BEFORE UPDATE ON requirements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 초기 데이터 (시스템 3개)
-- ============================================
INSERT INTO systems (name) VALUES
  ('쇼핑몰'),
  ('공급사'),
  ('관리자');

-- 기본 테스트 사이클 1개
INSERT INTO test_cycles (name, started_at) VALUES
  ('1차 테스트', now());

-- ============================================
-- RLS (Row Level Security) - 공개 접근 허용
-- 실제 배포 시 인증 설정 후 수정 권장
-- ============================================
ALTER TABLE systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE requirement_changes ENABLE ROW LEVEL SECURITY;

-- 모든 테이블에 public 읽기/쓰기 허용 (1인 PM 도구, 인증 없이 사용)
CREATE POLICY "public_all" ON systems FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON requirements FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON test_cycles FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON test_results FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON requirement_changes FOR ALL TO anon USING (true) WITH CHECK (true);
