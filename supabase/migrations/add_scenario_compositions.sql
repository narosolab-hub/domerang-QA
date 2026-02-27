-- Add scenario_compositions table for E2E grouping
-- Integration scenarios can be linked to E2E scenarios (N:M relationship)
-- One integration scenario can appear in multiple E2E flows

CREATE TABLE scenario_compositions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id       uuid NOT NULL REFERENCES test_scenarios(id) ON DELETE CASCADE, -- E2E 시나리오
  child_id        uuid NOT NULL REFERENCES test_scenarios(id) ON DELETE CASCADE, -- 통합 시나리오
  order_index     integer NOT NULL DEFAULT 0,                                    -- E2E 내 순서 (0부터)
  created_at      timestamptz DEFAULT now(),
  UNIQUE (parent_id, child_id)
);

CREATE INDEX idx_sc_parent ON scenario_compositions(parent_id);
CREATE INDEX idx_sc_child  ON scenario_compositions(child_id);
