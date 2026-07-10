import { NextResponse } from "next/server";
import { BFF_CACHE_HEADERS } from "../_shared/bff-cache";

/**
 * Kubernetes liveness / readiness probe.
 *
 * Health is intentionally decoupled from upstream services (emergency API,
 * etc.): if a dependency is down the dashboard should stay Ready so users see
 * the error in the UI, not a traffic-less pod.
 */
export function GET(): NextResponse {
  return NextResponse.json({ ok: true }, { status: 200, headers: BFF_CACHE_HEADERS });
}
