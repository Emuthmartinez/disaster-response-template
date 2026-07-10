/**
 * Recurso `api/public/contact` — CONFIG declarativa sobre la fábrica CRUD.
 * Bandeja de contacto del panel admin. La lógica/DB vive en services/contact;
 * la fábrica pone rate-limit, requireCapability, validación y auditoría.
 *
 * Ops habilitadas: list/get/create + update (mapeado a marcar-leído). El único
 * campo editable de un mensaje es `read`. Se OMITE `delete`: la bandeja es un
 * registro humanitario; no se borran mensajes por este endpoint.
 */
import { z } from "zod";
import { createCrudRouter, type CrudResource } from "@/public-api/crud-factory";
import * as service from "@/services/contact";

const createSchema = z.object({
  name: z.string().trim().min(1, "Indica tu nombre.").max(120),
  email: z.string().trim().email("Correo inválido.").max(200),
  subject: z.string().trim().min(1, "Indica el asunto.").max(200),
  message: z.string().trim().min(1, "Escribe un mensaje.").max(5000),
});

// Único campo editable: marcar como leído. Solo se acepta `read: true`.
const updateSchema = z.object({
  read: z.literal(true),
});

// DTO de SALIDA (lo que devuelve el service: ContactMessageDTO). Solo para
// documentar la forma del retorno en /api/docs.
const responseSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  subject: z.string(),
  message: z.string(),
  read: z.boolean(),
  createdAt: z.number(),
});

export const contactResource: CrudResource<
  Awaited<ReturnType<typeof service.listContactMessages>>[number],
  Awaited<ReturnType<typeof service.getContactMessageById>>,
  z.infer<typeof createSchema>,
  z.infer<typeof updateSchema>
> = {
  capability: "contact",
  schemas: { create: createSchema, update: updateSchema, response: responseSchema },
  ops: {
    list: () => service.listContactMessages(),
    get: (id) => service.getContactMessageById(id),
    create: async (input) => {
      // createContactMessage solo devuelve {id}; devolvemos el DTO completo.
      const { id } = await service.createContactMessage(input);
      const dto = await service.getContactMessageById(id);
      if (!dto) throw new Error("contact: el mensaje recién creado no se encontró");
      return dto;
    },
    // update == marcar leído (el zod garantiza read=true).
    update: (id) => service.setContactMessageRead(id),
  },
};

export const publicContactRouter = createCrudRouter(contactResource);
