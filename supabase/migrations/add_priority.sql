-- requirements 테이블에 priority 컬럼 추가
-- Supabase SQL Editor에서 실행하세요

ALTER TABLE requirements
ADD COLUMN IF NOT EXISTS priority text
  CHECK (priority IN ('높음', '중간', '낮음'));
