/**
 * Micro-caché en proceso para colapsar el polling masivo sin depender de un CDN.
 *
 * Cada instancia del servidor cachea el resultado ya construido de los GET
 * calientes durante `ttlMs`. Bajo carga (millones de pollers) esto convierte
 * "una query por request" en "una query por ventana de TTL por instancia".
 *
 * Dos garantías importantes bajo carga:
 *  - **single-flight**: si la entrada expira mientras llegan miles de requests a
 *    la vez, solo UNA dispara la recomputación; el resto no genera estampida.
 *  - **stale-while-revalidate**: si ya hay un valor viejo, se sirve al instante
 *    y la recomputación ocurre en segundo plano.
 *
 * Portado tal cual desde lib/cache.ts del app Next previo (mismo comportamiento).
 */

type Entry<T> = { at: number; value: T };

/** Tope de claves para acotar memoria con endpoints parametrizados (LRU simple). */
const MAX_ENTRIES = 500;

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

/**
 * Devuelve el valor cacheado para `key` si está fresco; si no, recomputa con
 * `fn`. Sirve valor viejo (si lo hay) mientras refresca en segundo plano.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;

  // Entrada vieja o ausente: una sola recomputación concurrente por clave.
  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = fn()
      .then((value) => {
        store.set(key, { at: Date.now(), value });
        // Reinsertar mueve la clave al final (orden de inserción de Map), así la
        // poda elimina la menos usada recientemente.
        if (store.size > MAX_ENTRIES) {
          const oldest = store.keys().next().value;
          if (oldest !== undefined) store.delete(oldest);
        }
        return value;
      })
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, p);
  }

  if (hit) {
    // SWR: servimos el valor viejo ya. Registramos un catch en el refresco de
    // fondo para no dejar una promesa rechazada sin manejar.
    p.catch(() => {});
    return hit.value;
  }
  // Primera vez (sin valor previo): hay que esperar la recomputación.
  return p;
}

/** Invalida una clave (o todo el caché) — útil tras una escritura. */
export function invalidate(key?: string): void {
  if (key === undefined) store.clear();
  else store.delete(key);
}
