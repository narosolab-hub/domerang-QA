-- test_results 테이블에 이슈 관리 컬럼 추가
-- Supabase SQL Editor에서 실행하세요

ALTER TABLE test_results
ADD COLUMN IF NOT EXISTS issue_raised boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS issue_fixed boolean NOT NULL DEFAULT false;
