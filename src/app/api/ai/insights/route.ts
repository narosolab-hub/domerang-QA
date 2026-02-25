import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getRequirementsWithResults } from '@/lib/queries'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { cycleId } = body

    if (!cycleId) {
      return NextResponse.json({ error: 'cycleId is required' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })
    }

    // 전체 요구사항 + 현재 테스트 상태 로드
    const allReqs = await getRequirementsWithResults(cycleId)

    // 시스템 → depth_0 → 요구사항 그룹핑
    type SystemGroup = Record<string, Record<string, {
      displayId: number | null
      featureName: string | null
      status: string
      spec: string | null
    }[]>>

    const grouped: SystemGroup = {}
    for (const r of allReqs) {
      const sysName = (r as any).systems?.name ?? '알 수 없음'
      const depth0 = r.depth_0 ?? '(분류 없음)'
      if (!grouped[sysName]) grouped[sysName] = {}
      if (!grouped[sysName][depth0]) grouped[sysName][depth0] = []
      grouped[sysName][depth0].push({
        displayId: r.display_id ?? null,
        featureName: r.feature_name ?? null,
        status: r.currentResult?.status ?? '미테스트',
        spec: r.original_spec ? r.original_spec.slice(0, 80) : null,
      })
    }

    // 통계 요약
    const total = allReqs.length
    const statusCounts: Record<string, number> = { Pass: 0, Fail: 0, Block: 0, 'In Progress': 0, '미테스트': 0 }
    for (const r of allReqs) {
      const s = r.currentResult?.status ?? '미테스트'
      statusCounts[s] = (statusCounts[s] ?? 0) + 1
    }
    const untestedCount = statusCounts['미테스트']

    // 요구사항 텍스트 직렬화
    const reqsText = Object.entries(grouped).map(([sysName, depths]) => {
      const depthBlocks = Object.entries(depths).map(([depth0, items]) => {
        const lines = items.map(item => {
          const id = item.displayId != null ? `#${item.displayId}` : ''
          const name = item.featureName ?? '(이름없음)'
          const spec = item.spec ? ` — ${item.spec}` : ''
          return `  - ${id} [${item.status}] ${name}${spec}`
        }).join('\n')
        return `[${depth0}]\n${lines}`
      }).join('\n\n')
      return `=== ${sysName} ===\n${depthBlocks}`
    }).join('\n\n')

    const prompt = `당신은 도매 B2B 플랫폼 QA 전략 전문가입니다.

## 플랫폼 소개
도매랑(Domerang)은 쇼핑몰(소비자 구매) · 공급사(도매 상품 공급) · 관리자(플랫폼 운영) 3개 시스템으로 구성된 B2B 도매 플랫폼입니다.
핵심 비즈니스 흐름: 공급사 상품 등록 → 관리자 승인 → 쇼핑몰 노출 → 소비자 주문/결제 → 공급사 발주/배송 → 정산/수수료

## 현황 요약
- 전체 요구사항: ${total}건
- Pass: ${statusCounts.Pass} / Fail: ${statusCounts.Fail} / Block: ${statusCounts.Block} / In Progress: ${statusCounts['In Progress']} / 미테스트: ${untestedCount}

## 전체 요구사항 목록 (시스템 > 기능 영역 > 항목)
${reqsText}

---

위 요구사항 전체를 읽고, 도매 플랫폼의 비즈니스 특성을 고려하여 아래 순서로 분석 결과를 한국어 마크다운으로 작성하세요.
**불필요한 서론 없이 바로 ### 1. 로 시작하세요.**

### 1. 핵심 비즈니스 플로우 기반 우선 테스트 영역 TOP 5
도매 플랫폼에서 수익·운영에 직결되는 기능 영역 5개를 선정하고, 각각 왜 중요한지와 미테스트 항목 #번호를 포함해 설명하세요.
(예: 주문/결제, 정산, 상품 등록 승인 등 핵심 플로우를 기준으로)

### 2. 시스템별 우선순위 추천
쇼핑몰 / 공급사 / 관리자 각 시스템에서 비즈니스 임팩트가 가장 크고 아직 미테스트인 기능을 3가지씩, #번호와 함께 추천하세요.

### 3. 현재 Fail/Block 중 비즈니스 위험 항목
Fail 또는 Block 상태인 항목 중 실제 서비스 운영에 치명적일 수 있는 것을 짚어주세요. 없으면 생략하세요.

### 4. QA 전략 제안
이 플랫폼의 특성(공급사-쇼핑몰-관리자 3자 연결 구조, 정산/수수료 민감도 등)을 고려해 어떤 순서·방식으로 QA를 진행하면 효율적인지 제안하세요.`

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const result = await model.generateContentStream(prompt)

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text()
            if (text) {
              controller.enqueue(new TextEncoder().encode(text))
            }
          }
        } catch (streamErr) {
          console.error('Gemini stream error:', streamErr)
          controller.error(streamErr)
        } finally {
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    })
  } catch (err) {
    console.error('AI insights route error:', err)
    const message = err instanceof Error ? err.message : '서버 오류가 발생했습니다'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
