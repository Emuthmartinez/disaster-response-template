/**
 * ============================================================================
 * Fábrica universal de CRUD para `api/public/*` — el equivalente Express de
 * un `GatedModelViewSet` DENY-BY-DEFAULT estándar: una base que convierte una
 * CONFIG declarativa por modelo en un Router con todas las protecciones puestas.
 * ============================================================================
 *
 * Por qué una fábrica (no un router a mano por modelo):
 *   - Una sola fuente de verdad para el orden de middleware y las protecciones
 *     (rate-limit → requireCapability → validate → handler → audit). Imposible
 *     olvidar una capa: si un modelo no declara una operación, esa ruta NO existe
 *     (deny-by-default), no queda abierta.
 *   - Cada modelo declara CONFIG, no boilerplate: capacidad, esquemas zod y qué
 *     función del service respalda cada verbo. La lógica/DB sigue en services/*.
 *
 * Convención de capacidades (CRUD): `${capability}:read|create|edit|delete`.
 * Rutas montadas (solo las que el modelo define en `ops`):
 *   GET    /        list    -> <cap>:read
 *   GET    /:id     get     -> <cap>:read
 *   POST   /        create  -> <cap>:create
 *   PATCH  /:id     update  -> <cap>:edit
 *   DELETE /:id     remove  -> <cap>:delete
 *
 * Separación de capas (clean architecture):
 *   resource config (interfaz) → crud-factory (interface/HTTP) → service (app) → db.
 */
import { Router, type Request } from "express";
import { z, type ZodType } from "zod";
import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { asyncHandler, rateLimit, validate } from "@/middleware";
import { requireCapability } from "@/middleware/auth";
import { writeAudit } from "@/auth/audit";
import { notFound } from "@/lib/errors";
import { isKnownCapability } from "@/auth/capabilities";

// Habilita .openapi() en zod (necesario para que el generador lea los esquemas).
extendZodWithOpenApi(z);

/** Una operación CRUD respaldada por una función del service. */
export interface CrudOps<TList, TItem, TCreate, TUpdate> {
  /** GET /  — lista (DTOs allowlist). Sin esto, no se monta la ruta de listado. */
  list?: () => Promise<TList[]>;
  /** GET /:id — uno por id. null/undefined = 404. */
  get?: (id: string) => Promise<TItem | null>;
  /** POST / — crea. Devuelve el DTO creado. */
  create?: (input: TCreate) => Promise<TItem>;
  /** PATCH /:id — actualiza campos permitidos. null = 404. */
  update?: (id: string, input: TUpdate) => Promise<TItem | null>;
  /** DELETE /:id — elimina. false = 404. */
  remove?: (id: string) => Promise<boolean>;
}

export interface CrudResource<TList, TItem, TCreate, TUpdate> {
  /** Prefijo de capacidad y nombre del recurso (singular): "report", "hospital". */
  capability: string;
  /** Tipo lógico para la auditoría (default = capability). */
  auditType?: string;
  /** Esquemas zod de entrada (solo los necesarios para las ops declaradas). */
  schemas?: {
    create?: ZodType;
    update?: ZodType;
    /**
     * Esquema zod del DTO de SALIDA (la forma que devuelven get/create/update y
     * los items de list). Solo para documentación OpenAPI — la validación de
     * salida no es necesaria (el service ya devuelve el allowlist). Si se da, las
     * respuestas en /api/docs muestran la forma exacta del retorno.
     */
    response?: ZodType;
  };
  /** Límites de rate por operación (opcional; hay defaults sanos por verbo). */
  limits?: Partial<Record<"list" | "get" | "create" | "update" | "remove", number>>;
  /** Las operaciones soportadas por este modelo. */
  ops: CrudOps<TList, TItem, TCreate, TUpdate>;
}

const DEFAULT_LIMITS = { list: 120, get: 120, create: 60, update: 60, remove: 60 };

const idParams = {
  // Validación mínima del :id. zod se importa perezosamente para no acoplar el
  // factory a una instancia concreta; el esquema es trivial y uniforme.
  parse: (v: unknown) => {
    const id = (v as { id?: unknown })?.id;
    if (typeof id !== "string" || id.length < 1) throw new Error("Falta el id");
    return { id };
  },
} as unknown as ZodType<{ id: string }>;

/**
 * Construye el Router CRUD deny-by-default a partir de la config del recurso.
 * Solo monta las rutas para las ops presentes en `resource.ops`.
 */
export function createCrudRouter<TList, TItem, TCreate, TUpdate>(
  resource: CrudResource<TList, TItem, TCreate, TUpdate>,
): Router {
  const router = Router();
  const cap = resource.capability;
  const auditType = resource.auditType ?? cap;
  const limits = { ...DEFAULT_LIMITS, ...(resource.limits ?? {}) };
  const { ops, schemas } = resource;

  // Fail-fast en arranque: la capacidad declarada debe existir en el catálogo,
  // y las escrituras deben traer su esquema de validación. Un error de config
  // tumba el server al iniciar (mejor que un 500 sirviendo a gente en emergencia).
  for (const verb of ["read", "create", "edit", "delete"] as const) {
    if (!isKnownCapability(`${cap}:${verb}`)) {
      throw new Error(`[crud-factory] capacidad desconocida: ${cap}:${verb} (añádela al catálogo)`);
    }
  }
  if (ops.create && !schemas?.create) throw new Error(`[crud-factory] ${cap}: falta schema.create`);
  if (ops.update && !schemas?.update) throw new Error(`[crud-factory] ${cap}: falta schema.update`);

  if (ops.list) {
    router.get(
      "/",
      rateLimit({ scope: `public:${cap}:list`, limit: limits.list }),
      requireCapability(`${cap}:read`),
      asyncHandler(async (_req, res) => {
        res.json({ items: await ops.list!() });
      }),
    );
  }

  if (ops.create) {
    router.post(
      "/",
      rateLimit({ scope: `public:${cap}:create`, limit: limits.create }),
      requireCapability(`${cap}:create`),
      validate({ body: schemas!.create }),
      asyncHandler(async (req, res) => {
        const item = await ops.create!(req.body as TCreate);
        await auditMutation(req, `${auditType}.create`, auditType, itemId(item));
        res.status(201).json({ item });
      }),
    );
  }

  if (ops.get) {
    router.get(
      "/:id",
      rateLimit({ scope: `public:${cap}:get`, limit: limits.get }),
      requireCapability(`${cap}:read`),
      validate({ params: idParams }),
      asyncHandler(async (req, res) => {
        const item = await ops.get!((req.params as { id: string }).id);
        if (item == null) throw notFound("No encontrado.");
        res.json({ item });
      }),
    );
  }

  if (ops.update) {
    router.patch(
      "/:id",
      rateLimit({ scope: `public:${cap}:edit`, limit: limits.update }),
      requireCapability(`${cap}:edit`),
      validate({ params: idParams, body: schemas!.update }),
      asyncHandler(async (req, res) => {
        const id = (req.params as { id: string }).id;
        const item = await ops.update!(id, req.body as TUpdate);
        if (item == null) throw notFound("No encontrado.");
        await auditMutation(req, `${auditType}.edit`, auditType, id, {
          fields: Object.keys(req.body as object),
        });
        res.json({ item });
      }),
    );
  }

  if (ops.remove) {
    router.delete(
      "/:id",
      rateLimit({ scope: `public:${cap}:delete`, limit: limits.remove }),
      requireCapability(`${cap}:delete`),
      validate({ params: idParams }),
      asyncHandler(async (req, res) => {
        const id = (req.params as { id: string }).id;
        const ok = await ops.remove!(id);
        if (!ok) throw notFound("No encontrado.");
        await auditMutation(req, `${auditType}.delete`, auditType, id);
        res.json({ ok: true });
      }),
    );
  }

  return router;
}

/** Extrae el id de un DTO para la auditoría (best-effort). */
function itemId(item: unknown): string | undefined {
  const id = (item as { id?: unknown })?.id;
  return typeof id === "string" ? id : undefined;
}

function auditMutation(
  req: Request,
  action: string,
  targetType: string,
  targetId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  return writeAudit(req, { action, targetType, targetId, metadata });
}

/* ============================================================================
 * Generación de OpenAPI desde la MISMA config del recurso (single source of
 * truth). Las rutas las monta `createCrudRouter` en runtime, así que no hay
 * bloques @swagger que escanear; en su lugar derivamos los path objects de las
 * ops + esquemas zod de cada recurso. Cero duplicación: el doc no puede
 * desincronizarse de la validación porque usa el MISMO esquema zod.
 * ========================================================================== */

/** Capitaliza para el tag/título ("report" -> "Report"). */
function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Registra en un OpenAPIRegistry las rutas CRUD de un recurso bajo
 * `/api/public/<basePath>`. Llamado por el doc builder para cada recurso.
 */
export function registerCrudOpenApi(
  registry: OpenAPIRegistry,
  basePath: string,
  resource: CrudResource<unknown, unknown, unknown, unknown>,
): void {
  const cap = resource.capability;
  const tag = `Public:${titleCase(basePath)}`;
  const base = `/api/public/${basePath}`;
  const { ops, schemas } = resource;
  const security = [{ bearerAuth: [] }];
  const idParam = {
    name: "id",
    in: "path" as const,
    required: true,
    schema: { type: "string" as const },
  };
  const errorRef = { $ref: "#/components/schemas/Error" };
  const errResponses = {
    401: { description: "No autenticado", content: { "application/json": { schema: errorRef } } },
    403: { description: "Sin capacidad", content: { "application/json": { schema: errorRef } } },
  };

  // Registra el DTO de salida como componente nombrado (p.ej. "ReportDTO") y
  // construye las envolturas reales que el factory devuelve:
  //   list   -> { items: DTO[] }      get/create/update -> { item: DTO }
  // Sin response schema, las respuestas quedan sin cuerpo documentado.
  const dtoName = `${titleCase(cap)}DTO`;
  let itemEnvelope: ZodType | undefined;
  let listEnvelope: ZodType | undefined;
  if (schemas?.response) {
    const dto = registry.register(dtoName, schemas.response);
    itemEnvelope = z.object({ item: dto });
    listEnvelope = z.object({ items: z.array(dto) });
  }
  const jsonContent = (schema?: ZodType) =>
    schema ? { content: { "application/json": { schema } } } : {};

  if (ops.list) {
    registry.registerPath({
      method: "get",
      path: base,
      tags: [tag],
      summary: `Listar (capability ${cap}:read)`,
      security,
      responses: {
        200: { description: "Lista de items", ...jsonContent(listEnvelope) },
        ...errResponses,
      },
    });
  }
  if (ops.create && schemas?.create) {
    registry.registerPath({
      method: "post",
      path: base,
      tags: [tag],
      summary: `Crear (capability ${cap}:create)`,
      security,
      request: {
        body: { content: { "application/json": { schema: schemas.create } }, required: true },
      },
      responses: {
        201: { description: "Creado", ...jsonContent(itemEnvelope) },
        400: { description: "Datos inválidos", content: { "application/json": { schema: errorRef } } },
        ...errResponses,
      },
    });
  }
  if (ops.get) {
    registry.registerPath({
      method: "get",
      path: `${base}/{id}`,
      tags: [tag],
      summary: `Obtener por id (capability ${cap}:read)`,
      security,
      parameters: [idParam],
      responses: {
        200: { description: "Item", ...jsonContent(itemEnvelope) },
        404: { description: "No encontrado", content: { "application/json": { schema: errorRef } } },
        ...errResponses,
      },
    });
  }
  if (ops.update && schemas?.update) {
    registry.registerPath({
      method: "patch",
      path: `${base}/{id}`,
      tags: [tag],
      summary: `Actualizar (capability ${cap}:edit)`,
      security,
      parameters: [idParam],
      request: {
        body: { content: { "application/json": { schema: schemas.update } }, required: true },
      },
      responses: {
        200: { description: "Actualizado", ...jsonContent(itemEnvelope) },
        404: { description: "No encontrado", content: { "application/json": { schema: errorRef } } },
        ...errResponses,
      },
    });
  }
  if (ops.remove) {
    registry.registerPath({
      method: "delete",
      path: `${base}/{id}`,
      tags: [tag],
      summary: `Eliminar (capability ${cap}:delete)`,
      security,
      parameters: [idParam],
      responses: {
        200: {
          description: "Eliminado",
          content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
        },
        404: { description: "No encontrado", content: { "application/json": { schema: errorRef } } },
        ...errResponses,
      },
    });
  }
}

/**
 * Construye SOLO el objeto `paths` (+ component schemas que zod necesite) para
 * todos los recursos CRUD dados. El doc builder lo fusiona con la spec base.
 */
export function buildCrudOpenApiPaths(
  resources: Record<string, CrudResource<unknown, unknown, unknown, unknown>>,
): { paths: object; components: object } {
  const registry = new OpenAPIRegistry();
  for (const [basePath, resource] of Object.entries(resources)) {
    registerCrudOpenApi(registry, basePath, resource);
  }
  const generator = new OpenApiGeneratorV3(registry.definitions);
  const doc = generator.generateDocument({
    openapi: "3.0.3",
    info: { title: "crud", version: "1.0.0" },
  });
  return { paths: doc.paths ?? {}, components: doc.components ?? {} };
}
