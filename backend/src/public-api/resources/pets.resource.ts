/**
 * Recurso `api/public/pets` — CONFIG declarativa sobre la fábrica CRUD, mismo
 * patrón que `missing.resource.ts`. La fábrica pone rate-limit,
 * requireCapability, validación y auditoría; la LÓGICA/DB vive en
 * `services/pets.ts`.
 *
 * Ops OMITIDAS a propósito:
 *   - La RESOLUCIÓN (marcar reunida / restaurar) NO va por `update`: tiene su
 *     propio flujo con nota obligatoria + foto-prueba (markPetFound). Aquí
 *     `update` solo edita la ficha; status/foto/resolución no son editables.
 *
 * El microchip SÍ es editable por esta vía (una integración puede corregirlo),
 * pero NUNCA vuelve en la respuesta: el DTO solo expone `hasMicrochip`. Ver
 * services/pets.ts.
 */
import { z } from "zod";
import { createCrudRouter, type CrudResource } from "@/public-api/crud-factory";
import * as service from "@/services/pets";

// Edad opcional en años: entero 0..120 (mismo rango que normalizeAge) o null.
const ageSchema = z.coerce.number().int().min(0).max(120).nullable();
const sexSchema = z.enum(service.PET_SEXES).nullable();

const createSchema = z.object({
  name: z.string().trim().max(service.MAX_NAME).optional(),
  species: z.string().trim().max(service.MAX_SPECIES).optional(),
  breed: z.string().trim().max(service.MAX_BREED).optional(),
  color: z.string().trim().max(service.MAX_COLOR).optional(),
  sex: sexSchema.optional(),
  age: ageSchema.optional(),
  description: z.string().trim().max(service.MAX_DESCRIPTION).optional(),
  lastSeen: z.string().trim().max(service.MAX_LAST_SEEN).optional(),
  contact: z.string().trim().max(service.MAX_CONTACT).optional(),
  microchip: z.string().trim().max(service.MAX_MICROCHIP).nullable().optional(),
  reportType: z.enum(["missing", "found"]).optional(),
});

const updateSchema = z
  .object({
    name: z.string().trim().max(service.MAX_NAME).optional(),
    species: z.string().trim().max(service.MAX_SPECIES).optional(),
    breed: z.string().trim().max(service.MAX_BREED).optional(),
    color: z.string().trim().max(service.MAX_COLOR).optional(),
    sex: sexSchema.optional(),
    age: ageSchema.optional(),
    description: z.string().trim().max(service.MAX_DESCRIPTION).optional(),
    lastSeen: z.string().trim().max(service.MAX_LAST_SEEN).optional(),
    contact: z.string().trim().max(service.MAX_CONTACT).optional(),
    microchip: z.string().trim().max(service.MAX_MICROCHIP).nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, "Envía al menos un campo a actualizar.");

// DTO de SALIDA (lo que devuelve el service: PetDTO). Solo documenta la forma
// del retorno en /api/docs. Nota que `microchip` NO está: no se serializa nunca.
const responseSchema = z.object({
  id: z.string(),
  name: z.string(),
  species: z.string(),
  breed: z.string(),
  color: z.string(),
  sex: z.enum(service.PET_SEXES).nullable(),
  age: z.number().nullable(),
  description: z.string(),
  lastSeen: z.string(),
  contact: z.string(),
  hasMicrochip: z.boolean(),
  photoUrl: z.string().nullable(),
  status: z.enum(["active", "found"]),
  resolutionNote: z.string().nullable(),
  resolutionPhotoUrl: z.string().nullable(),
  resolvedAt: z.number().nullable(),
  createdAt: z.number(),
});

export const petsResource: CrudResource<
  Awaited<ReturnType<typeof service.listPets>>[number],
  Awaited<ReturnType<typeof service.getPetById>>,
  z.infer<typeof createSchema>,
  z.infer<typeof updateSchema>
> = {
  capability: "pet",
  schemas: { create: createSchema, update: updateSchema, response: responseSchema },
  ops: {
    // Listado para integraciones: activas + reunidas, capado al tope de página.
    list: async () =>
      (await service.listPets({ includeFound: true })).slice(0, service.MAX_PAGE_SIZE),
    get: (id) => service.getPetById(id),
    create: (input) =>
      service.addPet({
        name: input.name,
        species: input.species,
        breed: input.breed,
        color: input.color,
        sex: input.sex,
        age: input.age,
        description: input.description,
        lastSeen: input.lastSeen,
        contact: input.contact,
        microchip: input.microchip,
        photo: null, // las integraciones no suben base64 por este endpoint
        reportType: input.reportType,
      }),
    update: (id, input) => service.updatePet(id, input),
    remove: (id) => service.removePet(id),
  },
};

export const publicPetsRouter = createCrudRouter(petsResource);
