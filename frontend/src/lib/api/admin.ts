import { apiFetch } from './fetch'
import { getConfig } from '@/config/env'

function base() {
  return `${getConfig().apiUrl}/admin`
}

function authHeaders(jwt: string) {
  return { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface SolvencySnapshot {
  totalPremiumReserve: string
  totalExposure: string
  solvencyRatio: number
  capturedAt: string
}

export interface FeatureFlag {
  key: string
  enabled: boolean
  description?: string
}

export interface AuditEntry {
  id: string
  actor: string
  action: string
  payload: Record<string, unknown>
  ipAddress?: string
  createdAt: string
}

export interface AuditPage {
  items: AuditEntry[]
  nextCursor?: string
}

export interface QueueStatus {
  name: string
  waiting: number
  active: number
  failed: number
}

export type AdminClaimStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID'

export interface AdminClaim {
  id: number
  policyId: string
  creatorAddress: string
  status: AdminClaimStatus
  amount: string
  description?: string
  createdAt: string
  updatedAt: string
}

export interface AdminClaimsPage {
  items: AdminClaim[]
  total: number
  nextCursor?: string
}

export interface BulkUpdateDryRunResult {
  affectedClaims: AdminClaim[]
  totalAffected: number
}

export interface BulkUpdateResult {
  updated: number
}

export interface RegisteredVoter {
  address: string
  registeredAt: string
}

export interface QuorumSettings {
  quorum_bps: number
  updatedAt: string
}

export interface QuorumImpact {
  activeClaims: number
  claimsBelowNewQuorum: number
  claimsAboveNewQuorum: number
}

// ── API calls ──────────────────────────────────────────────────────────────

export const adminApi = {
  getSolvency: (jwt: string) =>
    apiFetch<{ snapshot: SolvencySnapshot | null }>(`${base()}/solvency`, {
      headers: authHeaders(jwt),
    }),

  listFeatureFlags: (jwt: string) =>
    apiFetch<FeatureFlag[]>(`${base()}/feature-flags`, {
      headers: authHeaders(jwt),
    }),

  setFeatureFlag: (jwt: string, key: string, enabled: boolean) =>
    apiFetch<FeatureFlag>(`${base()}/feature-flags/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      headers: authHeaders(jwt),
      body: JSON.stringify({ enabled }),
    }),

  getAudits: (jwt: string, params: { cursor?: string; limit?: number; action?: string; actor?: string; dateFrom?: string; dateTo?: string }) => {
    const q = new URLSearchParams()
    if (params.cursor) q.set('cursor', params.cursor)
    if (params.limit) q.set('limit', String(params.limit))
    if (params.action) q.set('action', params.action)
    if (params.actor) q.set('actor', params.actor)
    if (params.dateFrom) q.set('dateFrom', params.dateFrom)
    if (params.dateTo) q.set('dateTo', params.dateTo)
    return apiFetch<AuditPage>(`${base()}/audits?${q}`, { headers: authHeaders(jwt) })
  },

  exportAuditsUrl: (jwt: string, action?: string, actor?: string, dateFrom?: string, dateTo?: string) => {
    const q = new URLSearchParams()
    if (action) q.set('action', action)
    if (actor) q.set('actor', actor)
    if (dateFrom) q.set('dateFrom', dateFrom)
    if (dateTo) q.set('dateTo', dateTo)
    return `${base()}/audits/export?${q}`
  },

  triggerReindex: (jwt: string, fromLedger: number, network: string) =>
    apiFetch<{ jobId: string; status: string }>(`${base()}/reindex`, {
      method: 'POST',
      headers: authHeaders(jwt),
      body: JSON.stringify({ fromLedger, network }),
    }),

  getClaims: (jwt: string, params: { cursor?: string; limit?: number; search?: string; status?: AdminClaimStatus }) => {
    const q = new URLSearchParams()
    if (params.cursor) q.set('cursor', params.cursor)
    if (params.limit) q.set('limit', String(params.limit))
    if (params.search) q.set('search', params.search)
    if (params.status) q.set('status', params.status)
    return apiFetch<AdminClaimsPage>(`${base()}/claims?${q}`, { headers: authHeaders(jwt) })
  },

  overrideClaimStatus: (jwt: string, claimId: number, status: AdminClaimStatus, reason: string) =>
    apiFetch<AdminClaim>(`${base()}/claims/${claimId}/override`, {
      method: 'POST',
      headers: authHeaders(jwt),
      body: JSON.stringify({ status, reason }),
    }),

  bulkUpdateClaims: (jwt: string, claimIds: number[], status: AdminClaimStatus, dryRun: boolean) =>
    apiFetch<BulkUpdateDryRunResult | BulkUpdateResult>(`${base()}/claims/bulk-update`, {
      method: 'POST',
      headers: authHeaders(jwt),
      body: JSON.stringify({ claimIds, status, dryRun }),
    }),

  listVoters: (jwt: string) =>
    apiFetch<RegisteredVoter[]>(`${base()}/governance/voters`, {
      headers: authHeaders(jwt),
    }),

  batchRegisterVoters: (jwt: string, addresses: string[]) =>
    apiFetch<{ registered: number }>(`${base()}/governance/voters/batch-register`, {
      method: 'POST',
      headers: authHeaders(jwt),
      body: JSON.stringify({ addresses }),
    }),

  removeVoter: (jwt: string, address: string) =>
    apiFetch<{ removed: boolean }>(`${base()}/governance/voters/${encodeURIComponent(address)}`, {
      method: 'DELETE',
      headers: authHeaders(jwt),
    }),

  getQuorumSettings: (jwt: string) =>
    apiFetch<QuorumSettings>(`${base()}/governance/quorum`, {
      headers: authHeaders(jwt),
    }),

  updateQuorumBps: (jwt: string, quorumBps: number) =>
    apiFetch<QuorumSettings>(`${base()}/governance/quorum`, {
      method: 'PUT',
      headers: authHeaders(jwt),
      body: JSON.stringify({ quorum_bps: quorumBps }),
    }),

  getActiveClaimsImpact: (jwt: string, newQuorumBps: number) =>
    apiFetch<QuorumImpact>(`${base()}/governance/quorum/impact?quorum_bps=${newQuorumBps}`, {
      headers: authHeaders(jwt),
    }),
}
