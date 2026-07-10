/**
 * Shared cache-control headers for all BFF routes.
 *
 * BFF responses must never be served from cache: they either forward
 * sensitive tokens, proxy external state, or return health snapshots.
 */
export const BFF_CACHE_HEADERS = { "Cache-Control": "no-store" } as const;
