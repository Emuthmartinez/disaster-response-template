# AGENTS.md — admin map

**Parent map:** `../AGENTS.md`

## Scope

Standalone Next.js administration service. Its same-origin BFF forwards to the
backend; session state is held in an httpOnly cookie.

## Where to look

| Task | Location | Notes |
|------|----------|-------|
| Pages / shell | `app/` | Next App Router |
| BFF routes | `app/api/` | Proxy to backend; not public-site API |
| Shared proxy | `app/api/_shared/proxy.ts` | Reuse request forwarding |
| API routing config | `src/config/api-registry.ts` | Backend base URL resolution |
| Session/auth | `src/shared/auth/` | Cookie and admin gate |
| HTTP client | `src/shared/http/` | Authenticated frontend requests |
| Domain screens | `src/contexts/` | Models, users, roles, keys and hub |
| UI primitives | `src/ui/` | Shared admin atoms/tokens |
| Tests | `tests/` | Vitest + Testing Library + MSW |

## Done (local)

See root `TOOLCHAIN.md` → `admin`. Ship changes also run `npm run build`.

## Hard stops (this package)

- Keep backend credentials and JWTs server-side; never expose them through
  `NEXT_PUBLIC_*`.
- Reuse the BFF proxy/session helpers; do not call internal backend URLs from
  browser components.
- Preserve httpOnly cookie handling and deny-by-default admin gates.
- Do not duplicate backend authorization decisions in UI-only checks.

## Ask first

- Session cookie, invitation, role/capability or API-key behavior changes.
- New admin exposure of crisis data or patient fields.

## Manual notes

<!-- Preserved on refresh -->
