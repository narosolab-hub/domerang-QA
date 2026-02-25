import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { requirementIds, scenarioType = 'integration', contextHint } = body as {
      requirementIds: string[]
      scenarioType: string
      contextHint?: string
    }

    if (!requirementIds || requirementIds.length === 0) {
      return NextResponse.json({ error: 'requirementIds가 필요합니다' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다' }, { status: 500 })
    }

    // 요구사항 조회
    const { data: reqs, error } = await supabase
      .from('requirements')
      .select('id, display_id, feature_name, original_spec, current_policy, depth_0, depth_1, depth_2, systems(id, name)')
      .in('id', requirementIds)

    if (error) throw error

    const reqList = (reqs ?? []) as any[]

    const reqText = reqList.map(r => {
      const path = [r.depth_0, r.depth_1, r.depth_2].filter(Boolean).join(' > ')
      const sysName = r.systems?.name ?? ''
      return [
        `[${sysName}] #${r.display_id ?? '-'} ${r.feature_name ?? ''}`,
        path ? `  경로: ${path}` : '',
        r.original_spec ? `  기존 요구사항: ${r.original_spec}` : '',
        r.current_policy ? `  최종 정책: ${r.current_policy}` : '',
      ].filter(Boolean).join('\n')
    }).join('\n\n')

    const typeLabel: Record<string, string> = {
      integration: '통합 테스트 (여러 시스템/기능이 연동되는 흐름 검증)',
      unit: '단위 테스트 (단일 기능/화면 검증)',
      e2e: 'E2E 테스트 (사용자 전체 여정 검증)',
    }

    const prompt = `당신은 도매 B2B 플랫폼 QA 전문가입니다.

## 플랫폼 소개
도매랑(Domerang)은 쇼핑몰(소비자 구매) · 공급사(도매 상품 공급) · 관리자(플랫폼 운영) 3개 시스템으로 구성된 B2B 도매 플랫폼입니다.
핵심 비즈니스 흐름: 공급사 상품 등록 → 관리자 승인 → 쇼핑몰 노출 → 소비자 주문/결제 → 공급사 발주/배송 → 정산/수수료

## 테스트 시나리오 유형
${typeLabel[scenarioType] ?? scenarioType}

${contextHint ? `## 추가 컨텍스트\n${contextHint}\n` : ''}
## 검증 대상 요구사항 목록
${reqText}

---

위 요구사항들을 아우르는 테스트 시나리오 하나를 JSON 형식으로 작성하세요.
JSON 이외의 텍스트는 절대 포함하지 마세요. 아래 스키마를 정확히 따르세요:

{
  "title": "시나리오 제목 (간결하게, 핵심 기능 흐름 중심)",
  "precondition": "사전 조건 (테스트 환경, 데이터, 로그인 상태 등. 여러 항목은 줄바꿈으로 구분)",
  "steps": "테스트 단계 (번호 매긴 목록. 각 단계는 '1. 행위 — 기대 반응' 형식. 여러 단계는 줄바꿈으로 구분)",
  "expected_result": "최종 기대 결과 (시나리오 전체 성공 기준. 여러 항목은 줄바꿈으로 구분)"
}`

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: { responseMimeType: 'application/json' },
    })

    const result = await model.generateContent(prompt)
    const text = result.response.text()

    let parsed: { title: string; precondition: string; steps: string; expected_result: string }
    try {
      parsed = JSON.parse(text)
    } catch {
      return NextResponse.json({ error: 'AI 응답 파싱 실패', raw: text }, { status: 500 })
    }

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('AI scenario route error:', err)
    const message = err instanceof Error ? err.message : '서버 오류가 발생했습니다'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
