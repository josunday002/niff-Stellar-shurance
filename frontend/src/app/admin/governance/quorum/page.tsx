'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, ShieldAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/hooks/useAuth'
import {
  adminApi,
  type QuorumImpact,
  type QuorumSettings,
} from '@/lib/api/admin'

function isStaff(jwt: string | null): boolean {
  if (!jwt) return false
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload?.role === 'admin' || payload?.isAdmin === true
  } catch {
    return false
  }
}

function isSuperAdmin(jwt: string | null): boolean {
  if (!jwt) return false
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload?.role === 'superadmin'
  } catch {
    return false
  }
}

export default function QuorumSettingsPage() {
  const { jwt } = useAuth()
  const staff = isStaff(jwt)
  const superAdmin = isSuperAdmin(jwt)

  if (!jwt) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <ShieldAlert className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-xl font-semibold">Authentication required</h1>
        <p className="text-sm text-muted-foreground">Connect your wallet and sign in to continue.</p>
      </main>
    )
  }

  if (!staff) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-6xl font-bold text-destructive">403</p>
        <h1 className="text-2xl font-semibold">Access denied</h1>
        <p className="text-muted-foreground max-w-sm">
          You do not have permission to view this page. Staff authentication is required.
        </p>
        <Link href="/" className="text-primary underline underline-offset-4 text-sm">
          Return home
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Quorum Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure governance quorum threshold.{' '}
          <Link href="/admin" className="text-primary underline underline-offset-2">
            ← Back to Admin
          </Link>
        </p>
      </div>
      <QuorumSettingsForm jwt={jwt} isSuperAdmin={superAdmin} />
    </main>
  )
}

function QuorumSettingsForm({ jwt, isSuperAdmin }: { jwt: string; isSuperAdmin: boolean }) {
  const [settings, setSettings] = useState<QuorumSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newBps, setNewBps] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [impact, setImpact] = useState<QuorumImpact | null>(null)
  const [impactLoading, setImpactLoading] = useState(false)
  const [impactError, setImpactError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)

  const loadSettings = useCallback(() => {
    setLoading(true)
    adminApi
      .getQuorumSettings(jwt)
      .then((data) => {
        setSettings(data)
        setNewBps(String(data.quorum_bps))
        setError(null)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load settings'))
      .finally(() => setLoading(false))
  }, [jwt])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  function handleInputChange(value: string) {
    setNewBps(value)
    setValidationError(null)
    setSaveSuccess(null)
  }

  function validateAndOpenConfirm() {
    const parsed = parseInt(newBps, 10)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10000) {
      setValidationError('Quorum BPS must be between 0 and 10000 (0%–100%).')
      return
    }
    if (settings && parsed === settings.quorum_bps) {
      setValidationError('The new value is the same as the current value.')
      return
    }

    setConfirmOpen(true)
    setImpact(null)
    setImpactError(null)
    setSaveError(null)
    setImpactLoading(true)

    adminApi
      .getActiveClaimsImpact(jwt, parsed)
      .then((data) => {
        setImpact(data)
      })
      .catch((e: unknown) => {
        setImpactError(e instanceof Error ? e.message : 'Failed to load impact analysis')
      })
      .finally(() => setImpactLoading(false))
  }

  async function handleConfirmSave() {
    const parsed = parseInt(newBps, 10)
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await adminApi.updateQuorumBps(jwt, parsed)
      setSettings(updated)
      setNewBps(String(updated.quorum_bps))
      setConfirmOpen(false)
      setSaveSuccess(`Quorum updated to ${updated.quorum_bps} BPS (${(updated.quorum_bps / 100).toFixed(2)}%).`)
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Failed to update quorum')
    } finally {
      setSaving(false)
    }
  }

  const currentPct = settings ? (settings.quorum_bps / 100).toFixed(2) : '—'
  const newParsed = parseInt(newBps, 10)
  const newPct = Number.isFinite(newParsed) ? (newParsed / 100).toFixed(2) : '—'

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Quorum Threshold</CardTitle>
          <CardDescription>
            The quorum threshold in basis points (BPS) determines the minimum voter participation
            required to finalize claim decisions. 1 BPS = 0.01%.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />
            </div>
          )}

          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

          {settings && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border bg-muted p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Current quorum</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">
                    {settings.quorum_bps} BPS
                  </p>
                  <p className="text-sm text-muted-foreground">{currentPct}%</p>
                </div>
                <div className="rounded-xl border bg-muted p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Last updated</p>
                  <p className="mt-2 text-lg font-semibold">
                    {new Date(settings.updatedAt).toLocaleString()}
                  </p>
                </div>
              </div>

              {isSuperAdmin ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="quorum-bps">New quorum (BPS)</Label>
                    <div className="flex gap-2">
                      <Input
                        id="quorum-bps"
                        type="number"
                        min={0}
                        max={10000}
                        value={newBps}
                        onChange={(e) => handleInputChange(e.target.value)}
                        className="max-w-[200px]"
                        aria-describedby={validationError ? 'quorum-bps-error' : 'quorum-bps-hint'}
                        aria-invalid={!!validationError}
                      />
                      <Button onClick={validateAndOpenConfirm}>
                        Update Quorum
                      </Button>
                    </div>
                    <p id="quorum-bps-hint" className="text-xs text-muted-foreground">
                      {Number.isFinite(newParsed) ? `= ${newPct}%` : 'Enter a valid number'}
                    </p>
                    {validationError && (
                      <p id="quorum-bps-error" className="text-xs text-destructive" role="alert">
                        {validationError}
                      </p>
                    )}
                    {saveSuccess && (
                      <p className="text-xs text-green-600" role="status">{saveSuccess}</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Only superadmin accounts can modify quorum settings.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Modal with Impact Analysis */}
      <Dialog open={confirmOpen} onOpenChange={(v) => !saving && setConfirmOpen(v)}>
        <DialogContent aria-labelledby="quorum-confirm-title" aria-describedby="quorum-confirm-desc">
          <DialogHeader>
            <DialogTitle id="quorum-confirm-title">Confirm Quorum Update</DialogTitle>
            <DialogDescription id="quorum-confirm-desc">
              You are about to change the quorum threshold from{' '}
              <strong>{settings?.quorum_bps} BPS ({currentPct}%)</strong> to{' '}
              <strong>{newBps} BPS ({newPct}%)</strong>.
              Review the impact on active claims below.
            </DialogDescription>
          </DialogHeader>

          {impactLoading && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading impact analysis" />
            </div>
          )}

          {impactError && (
            <p className="text-sm text-destructive" role="alert">{impactError}</p>
          )}

          {impact && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Impact on active claims</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Active claims</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{impact.activeClaims}</p>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
                  <p className="text-xs text-green-700">Would meet new quorum</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-green-700">
                    {impact.claimsAboveNewQuorum}
                  </p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
                  <p className="text-xs text-amber-700">Would fall below new quorum</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-amber-700">
                    {impact.claimsBelowNewQuorum}
                  </p>
                </div>
              </div>

              {impact.claimsBelowNewQuorum > 0 && (
                <p className="text-sm text-amber-700">
                  {impact.claimsBelowNewQuorum} active claim(s) currently above quorum would
                  fall below the new threshold. These claims will require additional votes
                  before they can be finalized.
                </p>
              )}
            </div>
          )}

          {saveError && (
            <p className="text-sm text-destructive" role="alert">{saveError}</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSave}
              disabled={saving || impactLoading}
              aria-busy={saving}
            >
              {saving ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Saving…</>
              ) : (
                'Confirm Update'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
