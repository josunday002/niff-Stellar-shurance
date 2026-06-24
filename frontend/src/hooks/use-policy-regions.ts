import { useEffect, useState } from 'react'
import { getConfig } from '@/config/env'

export interface PolicyRegion {
  value: string
  label: string
}

const FALLBACK_REGIONS: PolicyRegion[] = [
  { value: 'Low', label: 'Low Risk' },
  { value: 'Medium', label: 'Medium Risk' },
  { value: 'High', label: 'High Risk' },
]

export function usePolicyRegions() {
  const [regions, setRegions] = useState<PolicyRegion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const { apiUrl } = getConfig()

    async function fetchRegions() {
      try {
        const res = await fetch(`${apiUrl}/policy/regions`)
        if (!res.ok) throw new Error('Failed to load regions')
        const data = (await res.json()) as PolicyRegion[]
        if (!cancelled) {
          setRegions(data.length > 0 ? data : FALLBACK_REGIONS)
          setError(null)
        }
      } catch {
        if (!cancelled) {
          setRegions(FALLBACK_REGIONS)
          setError('Could not load regions from server, showing defaults.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchRegions()
    return () => { cancelled = true }
  }, [])

  return { regions, loading, error }
}
