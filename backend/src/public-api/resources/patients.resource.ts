/**
 * Recurso `api/public/patients` — CONFIG declarativa sobre la fábrica CRUD.
 * Pacientes hospitalizados (datos médicos sensibles): el DTO del service ya es
 * una allowlist estricta; aquí solo validamos la entrada con cotas sanas y
 * delegamos toda la lógica/DB al service. La fábrica pone rate-limit,
 * requireCapability, validación y auditoría.
 */
import { z } from "zod";
import { createCrudRouter, type CrudResource } from "@/public-api/crud-factory";
import { invalidate } from "@/lib/cache";
import * as service from "@/services/patients";

const condition = z.enum(["stable", "serious", "critical", "recovering", "unknown"]);
const status = z.enum([
  "hospitalized",
  "sheltered",
  "discharged",
  "transferred",
  "deceased",
]);

// age opcional/nullable; entero >= 0 y acotado a un máximo plausible (mismo
// clamp que el service: Math.max(0, trunc)).
const age = z.coerce.number().int().min(0).max(150).nullable();

const createSchema = z.object({
  hospitalId: z.string().trim().min(1, "Indica el hospital.").max(120),
  name: z.string().trim().min(1, "Indica el nombre.").max(120),
  age: age.optional(),
  condition: condition.optional(),
  status: status.optional(),
  notes: z.string().max(600).optional(),
  contact: z.string().max(120).optional(),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    age: age.optional(),
    condition: condition.optional(),
    status: status.optional(),
    notes: z.string().max(600).optional(),
    contact: z.string().max(120).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, "Envía al menos un campo a actualizar.");

// DTO de SALIDA (lo que devuelve el service: PatientDTO). Solo para documentar la
// forma del retorno en /api/docs.
const responseSchema = z.object({
  id: z.string(),
  hospitalId: z.string(),
  name: z.string(),
  age: z.number().nullable(),
  condition: z.string(),
  status: z.string(),
  notes: z.string(),
  contact: z.string(),
  admittedAt: z.number(),
  updatedAt: z.number(),
});

export const patientsResource: CrudResource<
  Awaited<ReturnType<typeof service.listPatients>>[number],
  Awaited<ReturnType<typeof service.getPatientById>>,
  z.infer<typeof createSchema>,
  z.infer<typeof updateSchema>
> = {
  capability: "patient",
  schemas: { create: createSchema, update: updateSchema, response: responseSchema },
  ops: {
    list: () => service.listPatients(),
    get: (id) => service.getPatientById(id),
    create: async (input) => {
      const patient = await service.createPatient(input);
      invalidate();
      return patient;
    },
    update: async (id, input) => {
      const patient = await service.updatePatient(id, input);
      if (patient) invalidate();
      return patient;
    },
    remove: async (id) => {
      const removed = await service.removePatient(id);
      if (removed) invalidate();
      return removed;
    },
  },
};

export const publicPatientsRouter = createCrudRouter(patientsResource);
