'use client'

import { useLocale } from 'next-intl'
import { useTransition } from 'react'

import { routing } from '@/i18n/routing'
import { usePathname, useRouter } from '@/i18n/navigation'

const LABELS: Record<string, string> = { en: 'English', es: 'Español' }

// Cookie name used by next-intl middleware to persist locale preference.
// Must match the cookieName in routing config (defaults to NEXT_LOCALE).
const LOCALE_COOKIE = 'NEXT_LOCALE'

export function LocaleSwitcher() {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const nextLocale = e.target.value

    // Persist preference in a cookie so the middleware can read it on the
    // next server request and avoid a redirect loop on page reload.
    // SameSite=Lax is safe here; no Secure flag needed (works on http too).
    document.cookie = `${LOCALE_COOKIE}=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`

    startTransition(() => {
      router.replace(pathname, { locale: nextLocale })
    })
  }

  return (
    <select
      value={locale}
      onChange={onChange}
      disabled={isPending}
      aria-label="Select language"
      className="rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
    >
      {routing.locales.map((l) => (
        <option key={l} value={l}>
          {LABELS[l] ?? l.toUpperCase()}
        </option>
      ))}
    </select>
  )
}
