# AGENTS.md — frontend map

**Parent map:** `../AGENTS.md`

## Scope

Next.js 16 + React 19 public UI and SSR. It also retains a legacy `/admin`
screen distinct from the standalone `../admin/` service. This package does not
own database access or the public API.

## Where to look

| Task | Location | Notes |
|------|----------|-------|
| Routes / metadata | `app/` | App Router; content groups live under route groups |
| Legacy admin | `app/(admin)/admin/` | Uses a browser-held admin token |
| Feature UI | `components/features/` | Domain-oriented visual modules |
| Shared layout / UI | `components/layout/`, `components/ui/` | Reuse before adding primitives |
| Client data | `hooks/` | TanStack Query queries and mutations |
| Browser HTTP | `lib/api.ts` | Absolute backend URL; includes `mediaUrl()` |
| Server HTTP | `lib/server-api.ts` | SSR calls via internal/public backend URL |
| Visual source of truth | `../docs/design/DESIGN.md` | Read before public visual changes |
| Tests | `tests/unit/` | Vitest |
| Next version docs | `node_modules/next/dist/docs/` | Use for Next 16 APIs |

## Done (local)

See root `TOOLCHAIN.md` → `frontend`. UI ship changes also run
`npm run build`.

## Hard stops (this package)

- No direct database access and no `app/api/**`; the backend owns `/api`.
- App API calls go through `lib/api.ts` or hooks; SSR uses `lib/server-api.ts`.
  Direct browser fetch is reserved for public third-party overlays such as
  RainViewer.
- Relative photo URLs pass through `mediaUrl()`.
- Public sensitive mutations keep Turnstile via `useTurnstile()`.
- Do not duplicate TanStack Query cache/polling with ad-hoc fetch loops.

## Ask first

- Changes to public report types or real-time polling semantics.
- New analytics, user-visible sensitive fields, or collection of personal data.

## Manual notes

<!-- Preserved on refresh -->
