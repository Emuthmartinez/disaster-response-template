/**
 * Enrutado de Cron Triggers.
 *
 * Vive aparte de `src/worker.ts` a propósito: ese módulo crea un servidor HTTP
 * e importa `cloudflare:node` en ámbito de módulo, así que no se puede importar
 * desde un test. Sacando aquí la decisión de "qué expresión ejecuta qué", la
 * parte con lógica queda cubierta por tests y `worker.ts` se queda solo con el
 * cableado.
 *
 * Las expresiones son la FUENTE DE VERDAD y `backend/wrangler.jsonc` debe
 * declarar exactamente estas mismas. `test/cron-jobs.test.ts` compara las dos
 * para que un cambio en el JSON no deje un cron huérfano que no ejecuta nada.
 */

/** Sync del catálogo de sismos (USGS). Ya en producción. */
export const CRON_EARTHQUAKES = "*/5 * * * *";

/**
 * Geocodificación de ubicaciones pendientes.
 *
 * Misma cadencia de 5 minutos que el sync de sismos pero DESFASADA dos minutos
 * (minutos 2, 7, 12, …). Dos motivos: `controller.cron` es la única forma de
 * distinguir un trigger de otro, así que dos expresiones idénticas serían
 * indistinguibles; y desfasarlas evita que las dos tareas compitan por el mismo
 * presupuesto de invocación.
 */
export const CRON_GEOCODE = "2-59/5 * * * *";

/** Todas las expresiones que este Worker espera recibir. */
export const CRON_EXPRESSIONS = [CRON_EARTHQUAKES, CRON_GEOCODE] as const;

export type CronHandler = (now: number) => Promise<void>;

/**
 * Ejecuta el handler de una expresión cron.
 *
 * Una expresión desconocida NO lanza: se registra y se vuelve. Lanzar haría que
 * Cloudflare reintentara un trigger que nunca va a coincidir, y el fallo real
 * (config y código desincronizados) no se arregla reintentando.
 */
export async function dispatchCron(
  cron: string,
  now: number,
  handlers: Readonly<Record<string, CronHandler>>,
): Promise<void> {
  const handler = handlers[cron];
  if (!handler) {
    console.warn(
      `[cron] expresión no reconocida: "${cron}". ` +
        `Esperadas: ${CRON_EXPRESSIONS.join(", ")}. No se ejecutó nada.`,
    );
    return;
  }
  await handler(now);
}
