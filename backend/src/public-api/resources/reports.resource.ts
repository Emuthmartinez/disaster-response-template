/**
 * Recurso `api/public/reports` — CONFIG declarativa sobre la fábrica CRUD.
 * Este es el PRECEDENTE limpio que el resto de modelos replican: aquí no hay
 * boilerplate de routing/middleware, solo capacidad + esquemas + qué función del
 * service respalda cada verbo. La fábrica pone rate-limit, requireCapability,
 * validación y auditoría.
 */
import { z } from "zod";
import { createCrudRouter, type CrudResource } from "@/public-api/crud-factory";
import * as service from "@/services/reports";

const reportType = z.enum([
  "critical",
  "supplies",
  "shelter",
  "nopower",
  "missing",
  "building",
  "starlink",
]);

const createSchema = z.object({
  type: reportType,
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  place: z.string().trim().min(1, "Indica el lugar.").max(200),
  affected: z.coerce.number().int().min(0).default(0),
  needs: z.string().max(1000).optional(),
});

const updateSchema = z
  .object({
    type: reportType.optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    place: z.string().trim().min(1).max(200).optional(),
    affected: z.coerce.number().int().min(0).optional(),
    needs: z.string().max(1000).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, "Envía al menos un campo a actualizar.");

// DTO de SALIDA (lo que devuelve el service: ReportDTO). Solo para documentar la
// forma del retorno en /api/docs.
const responseSchema = z.object({
  id: z.string(),
  type: reportType,
  lat: z.number(),
  lng: z.number(),
  place: z.string(),
  affected: z.number(),
  needs: z.string(),
  photoUrl: z.string().nullable(),
  confirmations: z.number(),
  createdAt: z.number(),
});

export const reportsResource: CrudResource<
  Awaited<ReturnType<typeof service.listReports>>[number],
  Awaited<ReturnType<typeof service.getReportById>>,
  z.infer<typeof createSchema>,
  z.infer<typeof updateSchema>
> = {
  capability: "report",
  schemas: { create: createSchema, update: updateSchema, response: responseSchema },
  ops: {
    list: () => service.listReports(),
    get: (id) => service.getReportById(id),
    create: (input) =>
      service.addReport({
        type: input.type,
        lat: input.lat,
        lng: input.lng,
        place: input.place,
        affected: input.affected,
        needs: input.needs,
        photo: null, // las integraciones no suben base64 por este endpoint
      }),
    update: (id, input) => service.updateReport(id, input),
    remove: (id) => service.removeReport(id),
  },
};

export const publicReportsRouter = createCrudRouter(reportsResource);
