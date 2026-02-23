-- test_results 테이블에 이슈 항목 목록 컬럼 추가
-- Supabase SQL Editor에서 실행하세요

ALTER TABLE test_results
ADD COLUMN IF NOT EXISTS issue_items jsonb DEFAULT '[]'::jsonb;
