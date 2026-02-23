# 도매랑 QA 대시보드 — CLAUDE.md

## 프로젝트 개요

도매랑 쇼핑몰 서비스의 QA 관리 도구. 요구사항 등록, 테스트 결과 기록, 이슈 추적, 진행 현황 시각화를 한 곳에서 관리한다.

- **요구사항 수**: 약 515개 (쇼핑몰 196 / 공급사 116 / 관리자 203)
- **사용자**: QA 담당자 + PO (소규모 내부 도구, 인증 없음)
- **배포**: Vercel 예정

---

## 기술 스택

| 항목 | 선택 |
|------|------|
| 프레임워크 | Next.js 15 (App Router) + TypeScript |
| 스타일 | Tailwind CSS v4 + shadcn/ui |
| DB / 백엔드 | Supabase (PostgreSQL + PostgREST) |
| 파일 파싱 | SheetJS (xlsx) — 엑셀 업로드 |
| AI | Google Gemini API (향후 시나리오 자동 생성 예정) |

---

## 디렉토리 구조

```
src/
├── app/
│   ├── page.tsx          # 메인 페이지 (탭 레이아웃, 전역 상태)
│   └── layout.tsx
├── components/
│   ├── DashboardTab.tsx  # 대시보드 탭 — 전체/시스템별/영역별 현황, 이슈 현황
│   ├── RequirementsTab.tsx # 요구사항 탭 — 목록, 필터, 정렬, 체크박스 삭제
│   ├── BacklogTab.tsx    # 백로그 탭 — 이슈 처리 현황판 + 테스트 작업 큐
│   ├── SidePanel.tsx     # 우측 상세 패널 — 테스트 결과 입력, 이력, 이슈 관리
│   ├── UploadModal.tsx   # 엑셀 업로드 모달
│   ├── AddRequirementModal.tsx # 신규 요구사항 수동 추가 모달
│   ├── CycleSelector.tsx # 테스트 사이클 선택/생성
│   └── StatusBadge.tsx   # 상태 뱃지 (Pass/Fail/Block/...)
├── lib/
│   ├── queries.ts        # 모든 Supabase 쿼리 함수
│   ├── types.ts          # 공유 TypeScript 타입
│   └── supabase.ts       # Supabase 클라이언트 초기화
supabase/
├── schema.sql            # 최초 DB 스키마 (Supabase SQL Editor에서 실행)
└── migrations/
    ├── add_priority.sql          # requirements.priority 컬럼
    ├── add_issue_tracking.sql    # test_results.issue_raised, issue_fixed
    ├── add_retest_needed.sql     # test_results.retest_reason
    ├── add_issue_items.sql       # test_results.issue_items (jsonb)
    └── add_display_id.sql        # requirements.display_id + related_ids
```

---

## DB 스키마 요약

### 테이블

```
systems              — 시스템 (쇼핑몰 / 공급사 / 관리자)
requirements         — 요구사항 (depth 0~3 계층, 기존 스펙, 최종 정책, 테스트 시나리오)
test_cycles          — 테스트 사이클 (1차, 2차 ...)
test_results         — 테스트 결과 (requirement_id + cycle_id unique)
requirement_changes  — 변경 이력 (테스트 상태/정책/우선순위 변경 시 자동 기록)
```

### 마이그레이션 실행 순서 (Supabase SQL Editor)

1. `supabase/schema.sql` — 최초 1회
2. `migrations/add_priority.sql`
3. `migrations/add_issue_tracking.sql`
4. `migrations/add_retest_needed.sql`
5. `migrations/add_issue_items.sql`
6. `migrations/add_display_id.sql`

### 주요 컬럼

**requirements**
- `depth_0 ~ depth_3` — 계층형 분류 (엑셀 병합셀 → fill-down 처리)
- `original_spec` — 기존 요구사항 원문 (업로드 기준 컬럼, 없으면 행 무시)
- `current_policy` — 최종 정책 (변경 시 `policy_updated_at`, `policy_note` 함께 기록)
- `priority` — `높음 | 중간 | 낮음 | null`
- `display_id` — 순차 정수 ID (사람이 읽기 쉬운 #번호, DB 시퀀스로 자동 부여)
- `related_ids` — 관련 요구사항 display_id 목록 (콤마 구분 문자열, e.g. `"12,45,78"`)

**test_results**
- `status` — `Pass | Fail | Block | In Progress | 미테스트`
- `issue_raised` — 전체 이슈라이징 완료 여부 (issue_items 전부 raised일 때 true)
- `issue_fixed` — 전체 수정 완료 여부 (issue_items 전부 fixed일 때 true)
- `issue_items` — 이슈 목록 jsonb 배열 `[{ text, raised, fixed }]`
- `retest_reason` — 재테스트 사유 `UIUX 수정 | 정책 변경 | 기타 | null`
- `tested_at` — 마지막 테스트 일시

**requirement_changes** (`changed_field` 값)
- `테스트 상태` — 상태 버튼 클릭 시 자동 기록 (old → new, change_reason = 테스터명)
- `최종 정책` — 저장 시 정책 내용이 바뀐 경우 기록
- `우선순위` — 저장 시 우선순위가 바뀐 경우 기록
- `관련 요구사항` — 저장 시 related_ids가 바뀐 경우 기록
- `이슈라이징` — 저장 시 issue_raised가 바뀐 경우 기록
- `수정 여부` — 저장 시 issue_fixed가 바뀐 경우 기록
- `요구사항명` / `시스템` / `경로` — 기본 정보 수정 시 기록
- `재테스트 사유` — 저장 시 retest_reason이 바뀐 경우 기록

---

## 핵심 기능

### 엑셀 업로드 (`UploadModal.tsx`)
- SheetJS로 `.xlsx / .xls / .csv` 파싱
- 헤더 행 자동 감지 (한글 헤더명 기반 컬럼 매핑)
- 병합 셀 → depth 컬럼 fill-down 처리
- **필터 기준: `original_spec`(상세)이 있는 행만 저장** — 섹션 헤더 행 제거용

### 요구사항 목록 (`RequirementsTab.tsx`)
- 시스템 / 상태 / 우선순위 / 시나리오 유무 드롭다운
- **Depth cascade 칩 필터**: 0Depth 선택 → 1Depth 칩 노출 (서버 쿼리로 처리)
- **ID 범위 필터**: `# from ~ to` 숫자 입력으로 display_id 범위 검색
- 검색: `feature_name`, `depth_0~2`, `original_spec` ilike
- **컬럼 정렬**: `#`, 경로/기능명, 우선순위, 상태 헤더 클릭 → 오름/내림차순 토글
- 테이블 레이아웃: `table-fixed` — 기능명 열이 남은 공간을 차지하고 `truncate` 처리

### 대시보드 (`DashboardTab.tsx`)
- 전체 현황 스탯 카드 + 스택 진행바
- 시스템별 진행률 + 이슈 현황 (2열)
- **기능 영역별(0Depth) SVG 링 차트 카드 그리드** — 외부 라이브러리 없음
  - Fail/Block 있는 카드는 빨간 테두리로 강조
- `getIssueStats()` — Fail/Block 중 이슈라이징/수정 완료 진행률

### 백로그 탭 (`BacklogTab.tsx`)
- **이슈 처리 현황판**: Fail + 이슈 등록 항목 (Block 제외)
  - 뷰 필터: `처리 중(기본)` / 전체 / 미이슈라이징 / 이슈라이징 완료 / 수정완료
  - 시스템 드롭다운 필터 (시스템 2개 이상일 때만 표시)
  - 최대 높이 300px 스크롤, 헤더 고정
  - 이슈 현황 열: issue_items 기준 완료 건수 (`n/total건`, 전부 완료 시 초록)
- **Block 현황**: Block 상태 항목만 별도 섹션
  - 시스템 드롭다운 필터, 최대 높이 220px 스크롤
  - 항목 없으면 섹션 자체 숨김
- **테스트 작업 큐**: 미테스트 + 재테스트 필요 항목 — 우선순위 정렬, 재테스트 항목 우선
- 항목 클릭 → 요구사항 탭으로 이동 후 사이드 패널 열림
- display_id 표시: `#번호` prefix

### 사이드 패널 (`SidePanel.tsx`)
- 기본 너비 50vw, 토글로 420px 전환
- 섹션 순서: 기본정보 → 기존요구사항 → 최종정책 → 기대결과 → 테스트시나리오 → 테스트결과 → 변경이력
- **헤더**: `#display_id` 뱃지 + 기능명 + 경로
- **상태 버튼 클릭 = 즉시 저장** (optimistic update + rollback)
- **최종 정책 textarea**: 내용 길이에 따라 자동 높이 확장 (resize-none + scrollHeight)
- **관련 요구사항**: 이름/키워드 검색 드롭다운으로 추가 (시스템명 + 경로 표시), 칩에 `#번호 이름` 함께 표시, 클릭 시 해당 요구사항으로 패널 이동 (`onNavigate` prop)
- **이슈 관리** (외부 이슈트래커 = 구글 스프레드시트 연동 전제):
  - 이슈 항목 목록: 텍스트 입력(항상 편집 가능) + 항목별 **이슈라이징 / 수정완료** 토글
  - `issue_raised` / `issue_fixed` = 전체 항목이 모두 완료일 때 true로 자동 계산
  - 항목 추가/삭제 가능
- **재테스트 사유**: `UIUX 수정 | 정책 변경 | 기타` 토글 버튼 — 헤더 뱃지로 표시
- **변경 이력 섹션**: `requirement_changes` 테이블 기반, 상대 시간 표시
- 저장 성공 시 버튼 "✓ 저장됨" 2.5초 표시

### 삭제
- `deleteRequirements()` — URL 길이 한도 방지를 위해 100개 단위로 분할 삭제

---

## 주요 쿼리 함수 (`queries.ts`)

| 함수 | 설명 |
|------|------|
| `getRequirementsWithResults(cycleId, filters?)` | 요구사항 + 테스트 결과 join, 필터 적용 |
| `getDepthValues(systemId?)` | cascade 필터용 depth_0/depth_1 목록 |
| `upsertTestResult(data)` | 테스트 결과 저장 (issue_items 포함) |
| `updateRequirement(id, updates)` | 요구사항 필드 업데이트 |
| `getRequirementByDisplayId(displayId, cycleId)` | display_id로 단건 조회 (관련 요구사항 이동용) |
| `searchRequirementsForRelated(query, excludeId?)` | 이름/번호로 관련 요구사항 검색 (드롭다운용, 시스템 포함) |
| `getRequirementNamesByDisplayIds(displayIds)` | display_id 배열 → `{id: name}` 맵 (칩 이름 표시용) |
| `logChange(data)` | 변경 이력 기록 (내부 try/catch, 메인 플로우 보호) |
| `getDashboardStats(cycleId)` | 전체/시스템별 상태 집계 |
| `getDepthGroupStats(cycleId)` | 0Depth별 링 차트 데이터 |
| `getIssueStats(cycleId)` | Fail/Block 이슈라이징/수정 완료 통계 |

---

## 코드 컨벤션

- **쿼리는 모두 `src/lib/queries.ts`에만** — 컴포넌트에서 직접 supabase 호출 금지
- 타입은 `src/lib/types.ts`에 중앙 관리
- shadcn/ui 컴포넌트 사용, 커스텀 스타일은 className prop으로만
- 상태 버튼처럼 즉시 저장이 필요한 경우 → optimistic update 패턴 사용
- 이력 로깅(`logChange`)은 메인 플로우 실패 방지를 위해 내부 try/catch로 감쌈
- 차트는 SVG 직접 구현 (외부 차트 라이브러리 미사용)
- 테이블 컬럼 너비 고정이 필요한 경우 `table-fixed` 사용 — `truncate`가 동작하려면 필수

---

## 환경 변수 (`.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

---

## 개발 명령어

```bash
npm run dev    # 개발 서버 (http://localhost:3000)
npm run build  # 프로덕션 빌드
npx tsc --noEmit  # 타입 체크
```

---

## 향후 예정 기능

- **AI 시나리오 자동 생성** — Google Gemini API 사용, `original_spec` 기반으로 `precondition / test_steps / expected_result` 자동 작성
- **테스트 사이클 비교** — 사이클 간 Pass/Fail 변화 추적
- **Vercel 배포** — 환경 변수 설정 후 배포
