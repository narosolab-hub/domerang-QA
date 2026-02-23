'use client'

import { Badge } from '@/components/ui/badge'
import type { TestStatus } from '@/lib/types'

const STATUS_CONFIG: Record<TestStatus, { label: string; className: string }> = {
  Pass: { label: 'Pass', className: 'bg-green-100 text-green-800 border-green-200 hover:bg-green-100' },
  Fail: { label: 'Fail', className: 'bg-red-100 text-red-800 border-red-200 hover:bg-red-100' },
  Block: { label: 'Block', className: 'bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100' },
  'In Progress': { label: '진행중', className: 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100' },
  '미테스트': { label: '미테스트', className: 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100' },
}

export function StatusBadge({ status }: { status: TestStatus }) {
  const config = STATUS_CONFIG[status]
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  )
}

export { STATUS_CONFIG }
