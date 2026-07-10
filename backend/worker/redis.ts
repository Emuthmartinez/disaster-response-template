/**
 * Valkey/Redis client for the background workers (BullMQ + distributed lock).
 *
 * Mirrors the standard single-ioredis-client pattern and a standard
 * distributed sync-lock pattern (SET NX EX + token + Lua CAS release) so the
 * migration is multi-node safe: only one producer enqueues at a time, and the
 * lock auto-expires if the holder dies.
 *
 * Reads VALKEY_URL (same secret the app uses): points at your Valkey/Redis
 * instance.
 */
import IORedis from "ioredis";

let _client: IORedis | null = null;

/** Shared ioredis client. `maxRetriesPerRequest: null` is REQUIRED by BullMQ. */
export function getRedis(): IORedis {
  if (_client) return _client;
  const url = process.env.VALKEY_URL;
  if (!url) throw new Error("VALKEY_URL is not set");
  _client = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  return _client;
}

// ---- Distributed lock (standard sync_lock pattern) -------------------------
// Acquire: SET key token NX EX ttl. Release: delete ONLY if our token owns it
// (Lua compare-and-set, so a slow holder whose lock already expired can't
// delete a lock a different holder now owns).

const RELEASE_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end`;

const HEARTBEAT_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('EXPIRE', KEYS[1], ARGV[2])
else
  return 0
end`;

/** Acquire a named lock. Returns a token on success, or null if already held. */
export async function acquireLock(
  key: string,
  ttlSeconds: number,
): Promise<string | null> {
  const token = crypto.randomUUID();
  const ok = await getRedis().set(key, token, "EX", ttlSeconds, "NX");
  return ok ? token : null;
}

/** Release a lock only if our token still owns it (no-op otherwise). */
export async function releaseLock(key: string, token: string): Promise<void> {
  if (!token) return;
  await getRedis().eval(RELEASE_LUA, 1, key, token);
}

/**
 * Start a heartbeat that renews the lock TTL while a long task runs. Returns a
 * stop() to clear it. If renewal ever fails (lock lost/expired), it stops.
 */
export function startHeartbeat(
  key: string,
  token: string,
  ttlSeconds: number,
  intervalMs: number,
): () => void {
  const h = setInterval(async () => {
    try {
      const ok = (await getRedis().eval(
        HEARTBEAT_LUA,
        1,
        key,
        token,
        String(ttlSeconds),
      )) as number;
      if (!ok) clearInterval(h); // lost the lock — stop renewing
    } catch {
      /* transient; next tick retries */
    }
  }, intervalMs);
  return () => clearInterval(h);
}
