/**
 * Predicado puro de "¿este host es el tier de API?", compartido por
 * middleware.ts (importa esta función) y espejado a mano en public/sw.js.
 *
 * Por qué se duplica en sw.js en vez de importarse: un service worker es un
 * script plano sin paso de build en esta plantilla — no puede hacer `import`
 * de un módulo TypeScript. Si cambias la regla aquí, actualiza también
 * `isApiRequest()` en public/sw.js (tiene un comentario que apunta de vuelta
 * a este fichero).
 *
 * La regla: el host de API es un PREFIJO de subdominio (p.ej. "api" en
 * "api.mapa.example.org"), configurado en config/deployment.config.json →
 * domains.api. `<prefijo>-staging.` es un hermano de `<prefijo>.`, no un
 * hijo (no es "api.staging.dominio"), así que hace falta comprobarlo aparte.
 */
export function matchesApiHost(host: string | null, apiPrefix: string): boolean {
  if (!host) return false;
  // host puede venir con puerto (api.localhost:3000) → basta el prefijo.
  return host.startsWith(`${apiPrefix}.`) || host.startsWith(`${apiPrefix}-staging.`);
}

/** Extrae el prefijo de subdominio de un host de API configurado (p.ej. "api.mapa.example.org" -> "api"). */
export function apiHostPrefix(configuredApiHost: string): string {
  return configuredApiHost.split(".")[0];
}
