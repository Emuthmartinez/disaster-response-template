/**
 * Recurso `api/public/missing` — CONFIG declarativa sobre la fábrica CRUD.
 * Mismo patrón que `reports.resource.ts`: capacidad + esquemas zod + qué función
 * del service respalda cada verbo. La fábrica pone rate-limit, requireCapability,
 * validación y auditoría. La LÓGICA/DB sigue en `services/missing.ts`.
 *
 * Ops OMITIDAS a propósito:
 *   - La RESOLUCIÓN (marcar localizada / restaurar) NO va por `update`: tiene su
 *     propio flujo con nota obligatoria + foto-prueba (markMissingFound). Aquí
 *     `update` solo edita la ficha; status/foto/resolución no son editables.
 */
import { z } from "zod";
import { createCrudRouter, type CrudResource } from "@/public-api/crud-factory";
import * as service from "@/services/missing";

// Edad opcional: número 0..130 (mismo rango que normalizeAge) o null para limpiarla.
const ageSchema = z.coerce.number().int().min(0).max(130).nullable();

const createSchema = z.object({
  name: z.string().trim().min(1, "Indica el nombre.").max(service.MAX_NAME),
  age: ageSchema.optional(),
  nationality: z.string().trim().max(service.MAX_NATIONALITY).optional(),
  description: z.string().trim().max(service.MAX_DESCRIPTION).optional(),
  lastSeen: z.string().trim().max(service.MAX_LAST_SEEN).optional(),
  contact: z.string().trim().max(service.MAX_CONTACT).optional(),
  reportType: z.enum(["missing", "found"]).optional(),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(service.MAX_NAME).optional(),
    age: ageSchema.optional(),
    nationality: z.string().trim().max(service.MAX_NATIONALITY).optional(),
    description: z.string().trim().max(service.MAX_DESCRIPTION).optional(),
    lastSeen: z.string().trim().max(service.MAX_LAST_SEEN).optional(),
    contact: z.string().trim().max(service.MAX_CONTACT).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, "Envía al menos un campo a actualizar.");

// DTO de SALIDA (lo que devuelve el service: MissingDTO). Solo para documentar la
// forma del retorno en /api/docs.
const responseSchema = z.object({
  id: z.string(),
  name: z.string(),
  age: z.number().nullable(),
  nationality: z.string(),
  description: z.string(),
  lastSeen: z.string(),
  contact: z.string(),
  photoUrl: z.string().nullable(),
  status: z.enum(["active", "found"]),
  resolutionNote: z.string().nullable(),
  resolutionPhotoUrl: z.string().nullable(),
  resolvedAt: z.number().nullable(),
  createdAt: z.number(),
});

export const missingResource: CrudResource<
  Awaited<ReturnType<typeof service.listMissing>>[number],
  Awaited<ReturnType<typeof service.getMissingById>>,
  z.infer<typeof createSchema>,
  z.infer<typeof updateSchema>
> = {
  capability: "missing",
  schemas: { create: createSchema, update: updateSchema, response: responseSchema },
  ops: {
    // Listado para integraciones: activas + localizadas, capado al tope de página.
    list: async () =>
      (await service.listMissing({ includeFound: true })).slice(0, service.MAX_PAGE_SIZE),
    get: (id) => service.getMissingById(id),
    create: (input) =>
      service.addMissing({
        name: input.name,
        age: input.age,
        nationality: input.nationality,
        description: input.description,
        lastSeen: input.lastSeen,
        contact: input.contact,
        photo: null, // las integraciones no suben base64 por este endpoint
        reportType: input.reportType,
      }),
    update: (id, input) => service.updateMissing(id, input),
    remove: (id) => service.removeMissing(id),
  },
};

export const publicMissingRouter = createCrudRouter(missingResource);
