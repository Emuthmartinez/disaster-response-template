/**
 * Recurso `api/public/hospitals` — CONFIG declarativa sobre la fábrica CRUD.
 * Mismo patrón que reports.resource: solo capacidad + esquemas + qué función del
 * service respalda cada verbo. La fábrica pone rate-limit, requireCapability,
 * validación y auditoría. La LÓGICA/DB vive en services/hospitals (insumos y POC
 * quedan FUERA: este recurso cubre solo el CRUD núcleo del hospital).
 */
import { z } from "zod";
import { createCrudRouter, type CrudResource } from "@/public-api/crud-factory";
import { invalidate } from "@/lib/cache";
import * as service from "@/services/hospitals";

const facilityType = z.enum([
  "hospital",
  "hospital_ivss",
  "hospital_militar",
  "hospital_pediatrico",
  "maternidad",
  "cdi",
  "refugio",
]);
const priorityZone = z.enum(["P0", "P1", "P2", "P3"]);
// `level` admite null explícito (sin nivel asignado), igual que el DTO.
const level = z.enum(["I", "II", "III", "IV", "militar"]).nullable();

const createSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(200),
  facilityType: facilityType.optional(),
  state: z.string().trim().min(1, "Indica el estado.").max(120),
  municipality: z.string().trim().max(120).optional(),
  address: z.string().trim().max(400).optional(),
  level: level.optional(),
  priorityZone: priorityZone.optional(),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    facilityType: facilityType.optional(),
    state: z.string().trim().min(1).max(120).optional(),
    municipality: z.string().trim().max(120).optional(),
    address: z.string().trim().max(400).optional(),
    level: level.optional(),
    priorityZone: priorityZone.optional(),
  })
  .refine((o) => Object.keys(o).length > 0, "Envía al menos un campo a actualizar.");

// DTO de SALIDA (lo que devuelve el service: Hospital). Solo para documentar la
// forma del retorno en /api/docs.
const responseSchema = z.object({
  id: z.string(),
  externalId: z.string().nullable(),
  name: z.string(),
  facilityType: z.string(),
  state: z.string(),
  municipality: z.string(),
  address: z.string(),
  level: z.string().nullable(),
  priorityZone: z.enum(["P0", "P1", "P2", "P3"]),
  isPriority: z.boolean(),
  activePatients: z.number(),
  totalPatients: z.number(),
  createdAt: z.number(),
});

export const hospitalsResource: CrudResource<
  Awaited<ReturnType<typeof service.listHospitals>>[number],
  Awaited<ReturnType<typeof service.getHospital>>,
  z.infer<typeof createSchema>,
  z.infer<typeof updateSchema>
> = {
  capability: "hospital",
  schemas: { create: createSchema, update: updateSchema, response: responseSchema },
  ops: {
    list: () => service.listHospitals(),
    get: (id) => service.getHospital(id),
    create: async (input) => {
      const hospital = await service.addHospital({
        name: input.name,
        facilityType: input.facilityType,
        state: input.state,
        municipality: input.municipality,
        address: input.address,
        level: input.level,
        priorityZone: input.priorityZone,
      });
      invalidate();
      return hospital;
    },
    update: async (id, input) => {
      const hospital = await service.updateHospital(id, input);
      if (hospital) invalidate();
      return hospital;
    },
    remove: async (id) => {
      const removed = await service.removeHospital(id);
      if (removed) invalidate();
      return removed;
    },
  },
};

export const publicHospitalsRouter = createCrudRouter(hospitalsResource);
