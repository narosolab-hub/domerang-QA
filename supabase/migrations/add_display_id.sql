-- requirements 테이블에 사용자 표시 ID 및 관련 요구사항 컬럼 추가
-- Supabase SQL Editor에서 실행하세요

-- 1. display_id 컬럼 추가 (초기에는 nullable)
ALTER TABLE requirements
ADD COLUMN IF NOT EXISTS display_id integer;

-- 2. 기존 행에 생성 순서대로 순차 ID 할당
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM requirements
  WHERE display_id IS NULL
)
UPDATE requirements r
SET display_id = n.rn
FROM numbered n
WHERE r.id = n.id;

-- 3. 시퀀스 생성 및 현재 최댓값으로 초기화
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE sequencename = 'requirements_display_id_seq') THEN
    CREATE SEQUENCE requirements_display_id_seq;
  END IF;
END $$;

SELECT setval('requirements_display_id_seq', COALESCE((SELECT MAX(display_id) FROM requirements), 0));

-- 4. display_id 기본값을 시퀀스로 설정 (이후 INSERT 시 자동 부여)
ALTER TABLE requirements
ALTER COLUMN display_id SET DEFAULT nextval('requirements_display_id_seq');

-- 5. 관련 요구사항 display_id 목록 컬럼 추가 (콤마 구분 숫자, e.g. "12,45,78")
ALTER TABLE requirements
ADD COLUMN IF NOT EXISTS related_ids text;
