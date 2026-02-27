-- Add system_ids column to test_scenarios for multi-system tagging
ALTER TABLE test_scenarios ADD COLUMN IF NOT EXISTS system_ids jsonb DEFAULT '[]'::jsonb;
