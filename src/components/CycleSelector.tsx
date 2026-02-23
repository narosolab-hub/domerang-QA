'use client'

import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { createTestCycle } from '@/lib/queries'
import type { TestCycle } from '@/lib/types'
import { Plus } from 'lucide-react'

interface Props {
  cycles: TestCycle[]
  selectedId: string
  onSelect: (id: string) => void
  onCycleCreated: (cycle: TestCycle) => void
}

export function CycleSelector({ cycles, selectedId, onSelect, onCycleCreated }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      const cycle = await createTestCycle(name.trim())
      onCycleCreated(cycle)
      onSelect(cycle.id)
      setOpen(false)
      setName('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={selectedId} onValueChange={onSelect}>
        <SelectTrigger className="w-44 h-8 text-sm">
          <SelectValue placeholder="사이클 선택" />
        </SelectTrigger>
        <SelectContent>
          {cycles.map(c => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(true)} title="새 사이클 추가">
        <Plus className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>새 테스트 사이클 생성</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="예: 2차 테스트"
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
              <Button onClick={handleCreate} disabled={loading || !name.trim()}>
                {loading ? '생성 중...' : '생성'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
