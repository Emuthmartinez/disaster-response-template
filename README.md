# Disaster Response Template

*[Léelo en español](README.es.md)*

A real-time citizen emergency map: georeferenced incident reports, a
missing-persons + hospital/shelter directory, an optional collection-center
directory, and an admin panel with role-based access. It's built for
organizations that need to stand up a disaster-response site — earthquake,
flood, hurricane, wildfire — in hours, not weeks, and hand day-to-day
operation to a small team afterward.

This is a **GitHub Template repository**. It has no history of its own event:
every identity (organization name, disaster name, region, domains, contact,
map center) lives in `config/deployment.config.json` and `.env`, never in
code. Click **Use this template**, and you get a clean, working, generic
instance ready to be configured for your situation.

## Who this is for

- Volunteer tech teams and NGOs responding to a specific disaster who need a
  working map + directory site immediately, run by people who are not
  full-time software engineers.
- Orgs that already run disaster-response infrastructure and want a
  documented, scrub-clean base instead of copying a previous event's repo
  (with that event's data, secrets, and assumptions still in it).
- Anyone standing this up with an AI coding agent doing the configuration and
  deploy work, not just the coding.

## The headline: an agent can take this from clone to live deployment

This template ships [Claude Code](https://claude.com/claude-code) skills
under `.claude/skills/`. Open the repo in an agent that reads `CLAUDE.md`
(Claude Code does this automatically) and ask it to stand up your
deployment — it runs a common setup sequence, then one of two deployment
paths:

1. **`disaster-configure`** — writes your organization, disaster, region, map
   center, and domains into `config/deployment.config.json` and the few
   static files that can't read it at runtime (PWA manifest, emergency
   contacts, example event data). Everything else in the app reads from this
   one file.
2. **`disaster-brand`** — applies your colors and logo across
   `docs/DESIGN.md`'s design tokens, the app's CSS variables, the PWA
   manifest, the favicon, and the generated social-preview (OpenGraph/
   Twitter) images.
3. **`disaster-secrets-bootstrap`** — generates every required secret
   (`JWT_SECRET`, `IP_SALT`, database/cache passwords, etc.) with `openssl
   rand`. Destination depends on your path below: a real `.env` (Path B) or
   Doppler (Path A) — same variable names either way.
4. **Deploy — pick one path:**
   - **Path A — Cloudflare Workers + Neon + Doppler (recommended for a new
     deployment):** `disaster-deploy-cloudflare` provisions Neon Postgres,
     applies the optional Cloudflare zone module, fills in each
     `wrangler.jsonc`, and deploys the frontend/backend/admin Workers. No
     server to maintain, scales on its own. Full operational runbook:
     [`docs/runbook-cloudflare-launch.md`](docs/runbook-cloudflare-launch.md).
   - **Path B — VPS + Docker Compose (alternative):**
     `disaster-deploy-vps` hardens a fresh Ubuntu VPS (deploy user, UFW,
     fail2ban), installs Docker, brings up `docker-compose.prod.yml` behind
     Caddy with Let's Encrypt TLS on your domains, and runs smoke checks. This
     is the **only** path where BullMQ background queues, interactive
     Postgres transactions, and the admin panel all run together with no
     adaptation. Runbook: [`docs/deploy-vps.md`](docs/deploy-vps.md).
5. **`disaster-content-audit`** — the final gate before you share your fork
   publicly or add contributors, regardless of which path you took: scans the
   whole tree for the kind of literal this template itself was scrubbed of
   (real IPs, personal emails, leftover secrets, a previous event's identity)
   and refuses to say "clean" until it actually is.

Each skill is a `SKILL.md` with exact file paths, verification steps, and
hard stops — an agent doesn't need any tribal knowledge beyond what's in the
repo. The human-readable version of this same path, covering both
deployment options, is [`docs/standup-guide.md`](docs/standup-guide.md).

## Architecture, in one paragraph

Three Next.js/Express apps, deployable two ways on the same codebase — see
[`docs/architecture.md`](docs/architecture.md) for the full picture and
`CLAUDE.md` for which to pick. `frontend/` (Next.js + React + Leaflet) is the
public map and directories; it never touches the database directly, only the
API. `backend/` (Express + TypeScript + Drizzle ORM over Postgres) serves
everything under `/api`. `admin/` is a separate Next.js microservice — a
backend-for-frontend with its own RBAC (JWT in an httpOnly cookie) that talks
to the backend over the internal network, never straight to the database.
**Path A (recommended):** all three run as Cloudflare Workers against
external Neon Postgres, with background jobs on Cloudflare Queues + Cron
Triggers instead of a long-running worker process. **Path B (alternative):**
one VPS, `docker-compose.prod.yml` + Caddy as the single TLS-terminating
reverse proxy, Postgres and Valkey co-located, plus `backend/worker/`
(BullMQ) for background sync, geocoding, deduplication, and optional hub
federation — this is the only path where those queues and interactive
database transactions both work without adaptation.

## Quickstart

With your information ready (org name, disaster/region, domains, real local
emergency numbers — see `docs/standup-guide.md` for the full list), Path A
takes about **45 minutes** of active work and Path B about **30 minutes**,
plus however long DNS propagation takes either way.

1. Click **Use this template** on GitHub and create your own repository from
   it.
2. Clone your new repository.
3. Open it in Claude Code (or another coding agent that reads
   `CLAUDE.md`/`AGENTS.md`).
4. Follow `CLAUDE.md` — it points the agent at the standup skills in the
   order above, and asks you which deployment path you want. Answer the
   questions it asks (your organization's name, your region's real emergency
   numbers, your domains) as they come up; the skills refuse to invent this
   information for you.

Prefer to do it by hand, or want to see every step before an agent runs it?
Read [`docs/standup-guide.md`](docs/standup-guide.md) — it covers both paths
with their own quickstarts.

## What this template deliberately does NOT include

- **Real datasets.** Every seed (hospitals, missing persons, emergency
  contacts, the reference earthquake event) is synthetic and obviously
  labeled as an example. There is no shortcut that ships real crisis data —
  you provide your region's real information yourself, deliberately, through
  `disaster-configure`.
- **Kubernetes / multi-node / a custom observability stack.** The two
  supported paths are Cloudflare Workers (which scales on its own, no
  cluster to run) and one VPS with docker compose and Caddy. A k3s+OpenTofu
  path for the VPS side and a Prometheus/Loki/Grafana observability stack
  are reasonable next steps at larger scale, but they are future work, not
  part of this template.
- **An i18n framework.** The UI ships in Spanish (the default language for
  this kind of deployment) as plain JSX strings — there is no next-intl/
  i18next abstraction underneath. Localizing to another language today means
  having your agent edit the copy directly; that's a real cost we chose not
  to hide behind a false claim of "multi-language support."

## Safety model

This kind of site collects information about people in crisis. The template
enforces a few things structurally, and asks the deployer to own the rest:

- **Content-audit gate.** `disaster-content-audit` (and `scripts/content-audit/`
  standalone) blocks on any of the literal patterns this repo's own history
  was scrubbed of — the same check that runs before this template's own
  releases runs on every fork that uses it.
- **No-real-data policy.** Seeds and fixtures are synthetic by convention
  (`AGENTS.md` makes this a hard rule for anyone contributing code). Real
  crisis data belongs in your database, never in a commit, an issue, or a
  screenshot.
- **Deployers' PII obligations.** Standing this up means you will collect
  real personal data about people in an emergency. That's a legal and
  ethical responsibility this template cannot discharge for you — see
  [`SECURITY.md`](SECURITY.md) for what it does enforce (rate limiting,
  bot-check on public writes, RBAC on the admin surface) and what remains
  yours to decide (retention, access, and eventually decommissioning the
  deployment).

## Credit

Maintained by [mallanet.org](https://mallanet.org). This template is
extracted from the production platform mallanet built and ran during the
2026 Venezuela earthquake response — the parts specific to that event and
everything sensitive were removed; the parts that make the software work
were kept and made generic. If you use this template for a real deployment,
you're standing on that field experience.

MIT licensed. See [`LICENSE`](LICENSE).
