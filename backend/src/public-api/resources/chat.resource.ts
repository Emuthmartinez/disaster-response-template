/**
 * Recurso `api/public/chat` — CONFIG declarativa sobre la fábrica CRUD.
 * Espeja el precedente de `reports.resource.ts`: solo capacidad + esquemas + qué
 * función del service respalda cada verbo. La fábrica pone rate-limit,
 * requireCapability, validación y auditoría.
 *
 * Los mensajes de chat son APPEND + READ + DELETE: una vez publicados son
 * inmutables, por eso se OMITE `update` (no hay edición de mensajes). La ruta
 * PATCH simplemente no se monta (deny-by-default).
 */
import { z } from "zod";
import { createCrudRouter, type CrudResource } from "@/public-api/crud-factory";
import * as service from "@/services/chat";

const chatRole = z.enum([
  "rescuer",
  "medic",
  "volunteer",
  "coordinator",
  "ngo",
  "citizen",
]);

// Bounds espejan las constantes que el service ya recorta (MAX_NAME / MAX_TEXT).
const createSchema = z.object({
  name: z.string().trim().max(service.MAX_NAME).optional(),
  text: z.string().trim().min(1, "El mensaje no puede ir vacío.").max(service.MAX_TEXT),
  role: chatRole.optional(),
  replyTo: z.string().trim().min(1).nullable().optional(),
});

// DTO de SALIDA (lo que devuelve el service: ChatDTO). Solo para documentar la
// forma del retorno en /api/docs.
const responseSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  text: z.string(),
  replyTo: z.string().nullable(),
  replyPreview: z.string().nullable(),
  threadRootId: z.string(),
  threadBumpedAt: z.number(),
  createdAt: z.number(),
});

export const chatResource: CrudResource<
  Awaited<ReturnType<typeof service.listMessages>>[number],
  Awaited<ReturnType<typeof service.getMessageById>>,
  z.infer<typeof createSchema>,
  never
> = {
  capability: "chat",
  schemas: { create: createSchema, response: responseSchema },
  ops: {
    list: () => service.listMessages(),
    get: (id) => service.getMessageById(id),
    create: (input) =>
      service.addMessage({
        name: input.name,
        text: input.text,
        role: input.role,
        replyTo: input.replyTo ?? null,
      }),
    remove: (id) => service.removeMessage(id),
    // update OMITIDO: los mensajes son inmutables.
  },
};

export const publicChatRouter = createCrudRouter(chatResource);
