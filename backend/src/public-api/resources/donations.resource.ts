/**
 * Recurso `api/public/donations` — CONFIG declarativa sobre la fábrica CRUD.
 * Mismo patrón que reports.resource.ts: solo capacidad + esquemas + qué función
 * del service respalda cada verbo; la fábrica pone rate-limit, requireCapability,
 * validación y auditoría.
 *
 * Donaciones = registro inmutable (intent/acopio). Se montan SOLO list/get/create:
 * se OMITEN edit/delete a propósito — un registro de donación no se reescribe ni
 * se borra (integridad del histórico humanitario), y el service no expone update/
 * remove.
 */
import { z } from "zod";
import { createCrudRouter, type CrudResource } from "@/public-api/crud-factory";
import * as service from "@/services/donations";

const createSchema = z.object({
  name: z.string().trim().min(1, "Indica un nombre.").max(120),
  // Centavos USD; mismos límites que valida el service (MIN/MAX_DONATION_CENTS).
  amountCents: z.coerce
    .number()
    .int()
    .min(service.MIN_DONATION_CENTS)
    .max(service.MAX_DONATION_CENTS),
});

// DTO de SALIDA (lo que devuelve el service: DonationDTO). Solo para documentar
// la forma del retorno en /api/docs.
const responseSchema = z.object({
  id: z.string(),
  name: z.string(),
  amountCents: z.number(),
  createdAt: z.number(),
});

export const donationsResource: CrudResource<
  Awaited<ReturnType<typeof service.listRecentDonations>>[number],
  Awaited<ReturnType<typeof service.getDonationById>>,
  z.infer<typeof createSchema>,
  never
> = {
  capability: "donation",
  schemas: { create: createSchema, response: responseSchema },
  ops: {
    list: () => service.listRecentDonations(),
    get: (id) => service.getDonationById(id),
    create: async (input) => {
      const { id } = await service.recordDonation({
        name: input.name,
        amountCents: input.amountCents,
      });
      // recordDonation solo devuelve {id}; releemos el DTO allowlist para el 201.
      const dto = await service.getDonationById(id);
      if (!dto) throw new Error("No se pudo leer la donación recién creada.");
      return dto;
    },
    // edit / delete: OMITIDOS — donaciones inmutables (deny-by-default).
  },
};

export const publicDonationsRouter = createCrudRouter(donationsResource);
