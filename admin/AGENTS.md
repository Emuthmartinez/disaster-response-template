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
| Domain screens | `src/contexts/` | Models, users, roles, keys, hub, hospital-supplies |
| Generic model CRUD | `src/contexts/models/model-registry.ts` | One entry per simple model; mirrors backend `PUBLIC_RESOURCES` |
| UI primitives | `src/ui/` | Shared admin atoms/tokens |
| Tests | `tests/` | Vitest + Testing Library + MSW |

Adding a screen: a flat CRUD model gets a `model-registry.ts` entry (columns +
create/edit fields) and nothing else; a domain with real workflow (like
`hospital-supplies` or `patient-imports`) gets its own bounded context under
`src/contexts/<name>/` plus BFF routes under `app/api/admin/<name>/`.

Deployment: this package runs as a Cloudflare Worker in both environments —
see `wrangler.jsonc` here, ops guide in `docs/runbook-admin.md`.

**`{items}` envelope contract:** `src/contexts/models/infrastructure/http-models-gateway.ts`
reads `GET /api/public/<path>` and requires a JSON body shaped `{ items: [...] }`
(same envelope the backend's CRUD factory always returns). Any hand-written
backend router meant to plug into a `model-registry.ts` entry — not generated
by the CRUD factory — MUST return that same `{items:[...]}` shape for its list
endpoint, or the generic list gateway throws a parse error and the screen
502s. This has bitten a real backport (see `deletion-requests` in
`model-registry.ts`): caught only by an E2E pass, not a unit test.

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
