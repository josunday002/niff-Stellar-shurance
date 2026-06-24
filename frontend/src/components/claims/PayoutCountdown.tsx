'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Clock } from 'lucide-react'

const DISPUTE_WINDOW_SECONDS = 3 * 24 * 60 * 60 // 3 days

export interface PayoutCountdownProps {
  approvedAt: string
  disputeWindowSeconds?: number
}

function formatTimeRemaining(totalSeconds: number): string {
  if (totalSeconds <= 0) return 'Imminent'
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (parts.length === 0) parts.push(`${seconds}s`)
  return parts.join(' ')
}

export function PayoutCountdown({
  approvedAt,
  disputeWindowSeconds = DISPUTE_WINDOW_SECONDS,
}: PayoutCountdownProps) {
  const [remaining, setRemaining] = useState<number>(() => {
    const approvedTime = new Date(approvedAt).getTime()
    const payoutTime = approvedTime + disputeWindowSeconds * 1000
    return Math.max(0, Math.floor((payoutTime - Date.now()) / 1000))
  })

  useEffect(() => {
    if (remaining <= 0) return

    const id = setInterval(() => {
      const approvedTime = new Date(approvedAt).getTime()
      const payoutTime = approvedTime + disputeWindowSeconds * 1000
      const newRemaining = Math.max(0, Math.floor((payoutTime - Date.now()) / 1000))
      setRemaining(newRemaining)
      if (newRemaining <= 0) clearInterval(id)
    }, 1000)

    return () => clearInterval(id)
  }, [approvedAt, disputeWindowSeconds, remaining])

  const expired = remaining <= 0

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-xl border bg-muted p-4">
        <Clock className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Payout auto-executes in
          </p>
          <p
            className="mt-1 text-xl font-semibold tabular-nums"
            data-testid="payout-countdown"
          >
            {expired ? 'Processing…' : formatTimeRemaining(remaining)}
          </p>
        </div>
      </div>

      {!expired && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="text-sm">
            This claim is within the dispute window. An admin can still raise a dispute before
            the payout auto-executes. Once the countdown reaches zero, the payout will be
            processed automatically and cannot be reversed.
          </p>
        </div>
      )}
    </div>
  )
}
