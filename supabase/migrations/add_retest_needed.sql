-- test_results 테이블에 재테스트 사유 컬럼 추가
-- Supabase SQL Editor에서 실행하세요
-- (이전에 retest_needed boolean을 추가했다면 아래 DROP 먼저 실행)

ALTER TABLE test_results
DROP COLUMN IF EXISTS retest_needed;

ALTER TABLE test_results
ADD COLUMN IF NOT EXISTS retest_reason text
  CHECK (retest_reason IN ('UIUX 수정', '정책 변경', '기타'));
