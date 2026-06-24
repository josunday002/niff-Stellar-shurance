'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Plus, ShieldAlert, Trash2 } from 'lucide-react'

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
import { adminApi, type RegisteredVoter } from '@/lib/api/admin'

function isStaff(jwt: string | null): boolean {
  if (!jwt) return false
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload?.role === 'admin' || payload?.isAdmin === true
  } catch {
    return false
  }
}

export default function VotersPage() {
  const { jwt } = useAuth()
  const staff = isStaff(jwt)

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
    <main className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Registered Voters</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage voter registrations for governance.{' '}
          <Link href="/admin" className="text-primary underline underline-offset-2">
            ← Back to Admin
          </Link>
        </p>
      </div>
      <VotersList jwt={jwt} />
    </main>
  )
}

function VotersList({ jwt }: { jwt: string }) {
  const [voters, setVoters] = useState<RegisteredVoter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [addressesInput, setAddressesInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const [removeTarget, setRemoveTarget] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    adminApi
      .listVoters(jwt)
      .then((data) => {
        setVoters(data)
        setError(null)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load voters'))
      .finally(() => setLoading(false))
  }, [jwt])

  useEffect(() => {
    load()
  }, [load])

  async function handleAdd() {
    const addresses = addressesInput
      .split(/[\n,]+/)
      .map((a) => a.trim())
      .filter(Boolean)

    if (addresses.length === 0) {
      setAddError('Enter at least one Stellar address.')
      return
    }

    const invalid = addresses.find((a) => !/^G[A-Z0-9]{55}$/.test(a))
    if (invalid) {
      setAddError(`Invalid Stellar address: ${invalid}`)
      return
    }

    setAdding(true)
    setAddError(null)
    try {
      await adminApi.batchRegisterVoters(jwt, addresses)
      setAddOpen(false)
      setAddressesInput('')
      load()
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : 'Registration failed')
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove() {
    if (!removeTarget) return
    setRemoving(true)
    setRemoveError(null)
    try {
      await adminApi.removeVoter(jwt, removeTarget)
      setRemoveTarget(null)
      load()
    } catch (e: unknown) {
      setRemoveError(e instanceof Error ? e.message : 'Removal failed')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Voters</CardTitle>
            <CardDescription>
              Registered voters eligible to participate in claim governance votes.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => { setAddError(null); setAddOpen(true) }}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Add Voters
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Address</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Registered At</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {voters.map((voter) => (
                  <tr key={voter.address} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono truncate max-w-[20rem]" title={voter.address}>
                      {voter.address}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono">
                      {new Date(voter.registeredAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => { setRemoveError(null); setRemoveTarget(voter.address) }}
                        aria-label={`Remove voter ${voter.address}`}
                      >
                        <Trash2 className="mr-1 h-3 w-3" aria-hidden="true" />
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
                {!loading && voters.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                      No registered voters found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {loading && (
            <div className="flex justify-center py-2">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Voters Modal */}
      <Dialog open={addOpen} onOpenChange={(v) => !adding && setAddOpen(v)}>
        <DialogContent aria-labelledby="add-voters-title" aria-describedby="add-voters-desc">
          <DialogHeader>
            <DialogTitle id="add-voters-title">Add Voters</DialogTitle>
            <DialogDescription id="add-voters-desc">
              Enter one or more Stellar addresses (G...) separated by commas or newlines to
              register them as governance voters via the batch registration entrypoint.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="voter-addresses">Stellar Addresses</Label>
            <textarea
              id="voter-addresses"
              rows={4}
              placeholder={"GABCDE...\nGFGHIJ..."}
              value={addressesInput}
              onChange={(e) => setAddressesInput(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-describedby={addError ? 'add-voter-error' : undefined}
              aria-invalid={!!addError}
            />
            {addError && (
              <p id="add-voter-error" className="text-xs text-destructive" role="alert">
                {addError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={adding} aria-busy={adding}>
              {adding ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Registering…</>
              ) : (
                'Register Voters'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Voter Confirmation Modal */}
      <Dialog open={!!removeTarget} onOpenChange={(v) => !removing && !v && setRemoveTarget(null)}>
        <DialogContent aria-labelledby="remove-voter-title" aria-describedby="remove-voter-desc">
          <DialogHeader>
            <DialogTitle id="remove-voter-title">Remove Voter</DialogTitle>
            <DialogDescription id="remove-voter-desc">
              Are you sure you want to remove this voter? This will call the voter removal
              contract entrypoint and revoke their governance voting rights.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border bg-muted p-3">
            <p className="text-xs text-muted-foreground">Address</p>
            <p className="font-mono text-sm break-all">{removeTarget}</p>
          </div>

          {removeError && (
            <p className="text-xs text-destructive" role="alert">{removeError}</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={removing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemove} disabled={removing} aria-busy={removing}>
              {removing ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Removing…</>
              ) : (
                'Confirm Removal'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
