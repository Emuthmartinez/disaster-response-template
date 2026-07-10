# AGENTS.md — backend map

**Parent map:** `../AGENTS.md`

## Scope

Express 5 API, Drizzle access, authentication, integrations and BullMQ workers.
This package shares the schema in `../infra/db/`.

## Where to look

| Task | Location | Notes |
|------|----------|-------|
| Server composition | `src/server.ts` | Router/module mount point |
| Public-site routes | `src/routes/` | Mutations require an approved guard |
| Authenticated API | `src/public-api/` | Capability-gated; CRUD uses resource config |
| Business logic | `src/services/` | Keep route handlers thin |
| External integrations | `src/modules/` | DDD layers; composition root reads env |
| Auth / RBAC | `src/auth/`, `src/middleware/` | JWT, API keys and capabilities |
| DB adapter | `src/db/` | Import `getDb`, `hasDbEnv`, `schema` here |
| Caching / rate limit | `src/lib/cache.ts`, `src/lib/rate-limit.ts` | Preserve operational limits |
| Workers / queues | `worker/` | Long-running work belongs here |
| Tests | `test/`, `eslint-rules/` | Integration tests need Postgres + Valkey |

## Done (local)

See root `TOOLCHAIN.md` → `backend`. Worker changes require the worker
`tsconfig` check; ship changes also run `npm run build`.

## Hard stops (this package)

- Every route declared under `src/routes/`, `src/public-api/` or `src/modules/`
  uses `rateLimit({ scope, limit })`; server health/readiness endpoints are
  outside that rule.
- `src/public-api/*` uses capabilities and never Turnstile.
- Public mutations in `src/routes/*` use Turnstile or an approved gate.
- Ordinary DB access uses Drizzle; do not create tables at API runtime.
- Never persist raw IPs; use `clientIp()` and `hashIp()`.
- Never expose patient staging fields, credentials or full input objects.

## Ask first

- Schema changes, migrations, backfills, patient bulk ingestion or queue purge.
- Capability/RBAC changes, public contracts, rate limits or cache semantics.

## Manual notes

<!-- Preserved on refresh -->
