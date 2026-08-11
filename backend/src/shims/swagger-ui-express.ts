/**
 * Stub de `swagger-ui-express` para el build de Cloudflare Workers.
 *
 * El paquete real sirve los assets estaticos de Swagger UI desde disco y para
 * localizarlos usa `__dirname`, que en Workers no existe: el Worker reventaba
 * en el arranque con `ReferenceError: __dirname is not defined` (durante el
 * import de server.ts, asi que TODA la API devolvia 1101, no solo /api/docs).
 *
 * Se cambia por este stub via el `alias` de wrangler.jsonc. Solo desaparece la
 * UI de /api/docs; la spec cruda (/api/openapi.json) la genera `lib/swagger.ts`
 * y sigue funcionando, que es lo que consumen los clientes de la API.
 *
 * En el despliegue con Docker/Node (docker-compose.prod.yml) NO aplica: alli se
 * usa el paquete real.
 */
import type { RequestHandler } from "express";

const passThrough: RequestHandler = (_req, _res, next) => next();

export const serve: RequestHandler[] = [passThrough];

export function setup(): RequestHandler {
  return (_req, res) => {
    res.status(501).json({
      error: "Swagger UI no esta disponible en el despliegue de Workers.",
      spec: "/api/openapi.json",
    });
  };
}

export default { serve, setup };
