# Internationalisation (i18n)

## Supported locales

| Code | Language |
|------|----------|
| `en` | English (default) |
| `es` | Español |

## How it works

- Routing is handled by [next-intl](https://next-intl-docs.vercel.app/) with the `[locale]` App Router segment (`src/app/[locale]/`).
- `localePrefix: 'as-needed'` means the default locale (`en`) has no URL prefix (`/`), while non-default locales are prefixed (`/es/`).
- The middleware (`src/middleware.ts`) runs next-intl's routing logic on every request, sets the `NEXT_LOCALE` cookie, and handles redirects.
- The `LocaleSwitcher` component also writes `NEXT_LOCALE` client-side so the preference survives a hard reload before the next server request.
- Message files live in `messages/<locale>/<namespace>.json`. The namespaces loaded per request are: `common`, `policy`, `claims`, `wallet`.

## Adding a new locale

1. Add the locale code to `src/i18n/routing.ts`:

   ```ts
   export const routing = defineRouting({
     locales: ['en', 'es', 'fr'],   // ← add here
     defaultLocale: 'en',
     localePrefix: 'as-needed',
   })
   ```

2. Create the message files under `messages/<locale>/`:

   ```
   messages/
   └── fr/
       ├── common.json
       ├── policy.json
       ├── claims.json
       └── wallet.json
   ```

   Copy the `en` files as a starting point and translate the values.

3. Add a display label in `src/components/LocaleSwitcher.tsx`:

   ```ts
   const LABELS: Record<string, string> = { en: 'English', es: 'Español', fr: 'Français' }
   ```

4. Update the type guard in `src/i18n/request.ts` to include the new code:

   ```ts
   if (!locale || !routing.locales.includes(locale as 'en' | 'es' | 'fr')) {
   ```

That's it — no other changes are required.
