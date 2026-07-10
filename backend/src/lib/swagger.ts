/**
 * Spec OpenAPI 3.0 del backend, generada en runtime a partir de los bloques
 * JSDoc `@swagger` que cada route lleva encima de su primer handler.
 *
 * Se sirve en `/api/docs` (Swagger UI) y `/api/openapi.json` (spec cruda), ver
 * server.ts. swagger-jsdoc escanea los .ts en dev (tsx) y los .js compilados en
 * prod (dist/), por eso el glob cubre ambas extensiones.
 *
 * Para que un endpoint aparezca DEBE tener su bloque `@swagger` (OpenAPI YAML)
 * sobre el handler. Sin él, no se registra (es la convención del repo).
 */
import path from "path";
import { fileURLToPath } from "url";
import swaggerJSDoc from "swagger-jsdoc";
import { buildCrudOpenApiPaths } from "@/public-api/crud-factory";
import { PUBLIC_RESOURCES } from "@/public-api";

const here = path.dirname(fileURLToPath(import.meta.url)); // .../src/lib (o dist/lib)
const srcRoot = path.resolve(here, ".."); // .../src (o dist)

/**
 * Construye la spec OpenAPI uniendo DOS fuentes:
 *   1. bloques @swagger de los routes escritos a mano (auth, sync, admin…),
 *   2. paths CRUD derivados de la config de cada recurso de api/public/*
 *      (single source of truth: el MISMO esquema zod que valida).
 */
export function buildOpenApiSpec(): object {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base = buildFromJsDoc() as any;
  const crud = buildCrudOpenApiPaths(PUBLIC_RESOURCES);
  return {
    ...base,
    paths: { ...(base.paths ?? {}), ...crud.paths },
    components: {
      ...(base.components ?? {}),
      ...crud.components,
      schemas: {
        ...(base.components?.schemas ?? {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...((crud.components as any)?.schemas ?? {}),
      },
      securitySchemes: {
        ...(base.components?.securitySchemes ?? {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...((crud.components as any)?.securitySchemes ?? {}),
      },
    },
  };
}

/** Solo la parte escaneada de los bloques @swagger (routes a mano). */
function buildFromJsDoc(): object {
  return swaggerJSDoc({
    definition: {
      openapi: "3.0.3",
      info: {
        title: "Mapa Emergencia — API",
        version: "1.0.0",
        description:
          "Superficie HTTP del backend. `api/public/*` es la superficie autenticada " +
          "(JWT por cookie httpOnly o `Authorization: Bearer`) para integraciones y admin, " +
          "con capacidades por endpoint. El resto es la superficie pública del sitio.",
      },
      components: {
        securitySchemes: {
          // JWT vía Authorization: Bearer (Postman/integraciones). La web usa la
          // cookie httpOnly, que el navegador manda sola; Swagger UI usa Bearer.
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
        schemas: {
          Error: {
            type: "object",
            properties: { error: { type: "string" } },
          },
          AuthMe: {
            type: "object",
            properties: {
              user: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  email: { type: "string" },
                  roleId: { type: "string", nullable: true },
                  orgId: { type: "string", nullable: true },
                  isAdmin: { type: "boolean" },
                },
              },
              capabilities: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
    // Escanea ambos: .ts (dev con tsx) y .js (prod compilado en dist/).
    apis: [
      path.join(srcRoot, "routes", "**", "*.{ts,js}"),
      path.join(srcRoot, "public-api", "**", "*.{ts,js}"),
      // Módulos de integración (DDD): el @swagger vive en su capa interface/http.
      path.join(srcRoot, "modules", "**", "*.{ts,js}"),
    ],
  });
}
