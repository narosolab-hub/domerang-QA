-- ──────────────────────────────────────────────────────────────────────────────
-- 통합 테스트 시나리오 테이블 추가
-- 실행: Supabase SQL Editor에서 한 번 실행
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. 시나리오 본체
CREATE TABLE IF NOT EXISTS test_scenarios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  scenario_type   TEXT NOT NULL DEFAULT 'integration'
                  CHECK (scenario_type IN ('integration', 'unit', 'e2e')),
  business_context TEXT,
  precondition    TEXT,
  steps           TEXT NOT NULL DEFAULT '',
  expected_result TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'draft', 'deprecated')),
  ai_generated    BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_test_scenarios_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_test_scenarios_updated_at
  BEFORE UPDATE ON test_scenarios
  FOR EACH ROW EXECUTE FUNCTION update_test_scenarios_updated_at();

-- 2. 시나리오 ↔ 요구사항 N:M 연결
CREATE TABLE IF NOT EXISTS scenario_requirements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id     UUID NOT NULL REFERENCES test_scenarios(id) ON DELETE CASCADE,
  requirement_id  UUID NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  order_index     INTEGER NOT NULL DEFAULT 0,
  verify_note     TEXT,
  UNIQUE (scenario_id, requirement_id)
);

CREATE INDEX IF NOT EXISTS idx_scenario_requirements_scenario
  ON scenario_requirements(scenario_id);
CREATE INDEX IF NOT EXISTS idx_scenario_requirements_requirement
  ON scenario_requirements(requirement_id);

-- 3. 사이클별 시나리오 테스트 결과
CREATE TABLE IF NOT EXISTS scenario_results (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID NOT NULL REFERENCES test_scenarios(id) ON DELETE CASCADE,
  cycle_id    UUID NOT NULL REFERENCES test_cycles(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT '미테스트',
  tester      TEXT,
  tested_at   TIMESTAMPTZ,
  note        TEXT,
  issue_items JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scenario_id, cycle_id)
);

CREATE INDEX IF NOT EXISTS idx_scenario_results_cycle
  ON scenario_results(cycle_id);
