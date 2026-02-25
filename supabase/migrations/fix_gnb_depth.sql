-- depth_0 = 'GNB'인 행들의 depth를 한 칸씩 앞으로 당김
-- Before: GNB > 상품 관리 > 상품 조회
-- After:  상품 관리 > 상품 조회

-- 실행 전 확인용 (영향받는 행 수)
-- SELECT COUNT(*) FROM requirements WHERE depth_0 = 'GNB';

UPDATE requirements
SET
  depth_0 = depth_1,
  depth_1 = depth_2,
  depth_2 = depth_3,
  depth_3 = NULL
WHERE depth_0 = 'GNB';
