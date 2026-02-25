'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Sparkles, Loader2, RefreshCw } from 'lucide-react'

interface Props {
  cycleId: string
}

type Status = 'idle' | 'loading' | 'streaming' | 'done' | 'error'

// ── 섹션별 색상 설정 ────────────────────────────────────────────────────────
const SECTION_STYLES = [
  { border: 'border-l-purple-500', headerBg: 'bg-purple-50', headerText: 'text-purple-800', numBg: 'bg-purple-500' },
  { border: 'border-l-blue-500',   headerBg: 'bg-blue-50',   headerText: 'text-blue-800',   numBg: 'bg-blue-500'   },
  { border: 'border-l-orange-500', headerBg: 'bg-orange-50', headerText: 'text-orange-800', numBg: 'bg-orange-500' },
  { border: 'border-l-emerald-500',headerBg: 'bg-emerald-50',headerText: 'text-emerald-800',numBg: 'bg-emerald-500'},
]

// ── 인라인 텍스트 파싱 (**볼드**, #번호 칩) ──────────────────────────────────
function parseInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>')
    .replace(
      /#(\d{1,6})\b/g,
      '<span style="display:inline-flex;align-items:center;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:600;font-family:monospace;background:#ede9fe;color:#6d28d9;margin:0 1px;">#$1</span>'
    )
}

// ── 섹션 본문 렌더링 ─────────────────────────────────────────────────────────
function SectionBody({ text, sectionIdx }: { text: string; sectionIdx: number }) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let listBuf: string[] = []
  let listKey = 0

  const flushList = () => {
    if (listBuf.length === 0) return
    elements.push(
      <ul key={`ul-${sectionIdx}-${listKey++}`} className="space-y-2 my-2">
        {listBuf.map((item, i) => (
          <li key={i} className="flex gap-2.5 items-start text-sm text-gray-700 leading-relaxed">
            <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
            <span dangerouslySetInnerHTML={{ __html: parseInline(item) }} />
          </li>
        ))}
      </ul>
    )
    listBuf = []
  }

  lines.forEach((line, i) => {
    const listMatch = line.match(/^-\s+(.+)/)
    if (listMatch) {
      listBuf.push(listMatch[1])
    } else if (line.trim() === '') {
      flushList()
    } else {
      flushList()
      elements.push(
        <p
          key={`p-${sectionIdx}-${i}`}
          className="text-sm text-gray-700 leading-relaxed my-1"
          dangerouslySetInnerHTML={{ __html: parseInline(line) }}
        />
      )
    }
  })
  flushList()

  return <div className="px-3 py-2.5">{elements}</div>
}

// ── 전체 마크다운 → 섹션 카드 파싱 ──────────────────────────────────────────
function MarkdownView({ text, streaming }: { text: string; streaming: boolean }) {
  const parts = text.split(/^(?=### )/m)
  const nodes: React.ReactNode[] = []
  let sectionIdx = 0

  for (const part of parts) {
    const match = part.match(/^### (.+?)\n([\s\S]*)/)
    if (!match) {
      // 섹션 헤더 전 텍스트
      const trimmed = part.trim()
      if (trimmed) {
        nodes.push(
          <p key="pre" className="text-sm text-gray-500 mb-3"
            dangerouslySetInnerHTML={{ __html: parseInline(trimmed) }} />
        )
      }
      continue
    }

    const rawTitle = match[1].trim()
    const body = match[2]?.trimEnd() ?? ''
    const title = rawTitle.replace(/^\d+\.\s*/, '')
    const cfg = SECTION_STYLES[sectionIdx % SECTION_STYLES.length]

    nodes.push(
      <div key={`s-${sectionIdx}`} className={`border-l-4 ${cfg.border} rounded-r-lg overflow-hidden mb-3.5`}>
        <div className={`${cfg.headerBg} px-3 py-2 flex items-center gap-2`}>
          <span className={`${cfg.numBg} text-white text-xs font-bold rounded px-1.5 py-0.5 flex-shrink-0 min-w-[20px] text-center`}>
            {sectionIdx + 1}
          </span>
          <span className={`text-sm font-semibold ${cfg.headerText}`}>{title}</span>
        </div>
        {body && <SectionBody text={body} sectionIdx={sectionIdx} />}
      </div>
    )
    sectionIdx++
  }

  return (
    <div>
      {nodes}
      {streaming && (
        <span className="inline-block w-1 h-4 bg-purple-400 animate-pulse rounded-sm align-middle" />
      )}
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export function AIInsightsCard({ cycleId }: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [content, setContent] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const runAnalysis = async () => {
    setStatus('loading')
    setContent('')
    setErrorMsg('')

    try {
      const res = await fetch('/api/ai/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycleId }),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        let message = `서버 오류 (HTTP ${res.status})`
        try {
          const err = JSON.parse(text)
          if (err.error) message = err.error
        } catch {
          if (res.status === 500) message = '서버 내부 오류 — 개발자 콘솔(F12)에서 상세 확인'
        }
        throw new Error(message)
      }

      if (!res.body) throw new Error('응답 스트림이 없습니다')

      setStatus('streaming')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        setContent(prev => prev + decoder.decode(value, { stream: true }))
      }

      setStatus('done')
    } catch (err) {
      console.error('AI insights error:', err)
      setErrorMsg(err instanceof Error ? err.message : '분석 중 오류가 발생했습니다')
      setStatus('error')
    }
  }

  const isRunning = status === 'loading' || status === 'streaming'

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            AI 인사이트
          </CardTitle>
          <button
            onClick={runAnalysis}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRunning ? (
              <><Loader2 className="w-3 h-3 animate-spin" />분석 중...</>
            ) : status === 'done' || status === 'error' ? (
              <><RefreshCw className="w-3 h-3" />다시 분석</>
            ) : (
              <><Sparkles className="w-3 h-3" />AI 분석 실행</>
            )}
          </button>
        </div>
      </CardHeader>

      <CardContent>
        {status === 'idle' && (
          <div className="text-center py-8 text-gray-400 text-sm">
            <Sparkles className="w-8 h-8 mx-auto mb-2 text-purple-200" />
            <p>전체 요구사항을 읽고 도매 플랫폼 비즈니스 흐름 기준으로</p>
            <p>어떤 기능을 먼저 테스트해야 할지 우선순위를 제안합니다.</p>
          </div>
        )}

        {status === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-8 text-gray-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
            요구사항 분석 중...
          </div>
        )}

        {(status === 'streaming' || status === 'done') && content && (
          <MarkdownView text={content} streaming={status === 'streaming'} />
        )}

        {status === 'error' && (
          <div className="py-4 text-center">
            <p className="text-red-500 text-sm font-medium">분석 실패</p>
            <p className="text-gray-400 text-xs mt-1">{errorMsg}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
