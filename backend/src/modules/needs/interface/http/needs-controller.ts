import type { Request, Response } from "express";
import { z } from "zod";
import { env } from "@/config/env";
import { badRequest, HttpError, notFound, serviceUnavailable } from "@/lib/errors";
import { NEED_CATEGORIES, NEED_PRIORITIES, type NewNeed } from "../../domain/need";
import {
  enqueueNeedPublication,
  getNeedPublicationState,
} from "../../infrastructure/needs-publication-queue";

// Origen del `author`, fijado por el servidor (nunca se acepta del cliente).
// Configúralo con el dominio público real de tu propio despliegue.
const AUTHOR_SOURCE = process.env.NEEDS_AUTHOR_SOURCE || "example.org";

const itemSchema = z.object({
  name: z.string().trim().min(1, "Indica qué necesitas.").max(120),
  quantity: z.coerce.number().int().min(1).max(100000),
  unit: z.string().trim().max(40).optional(),
  category: z.enum(NEED_CATEGORIES),
});

// Contacto opcional del solicitante: el cliente solo aporta los datos.
const authorSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email("Correo inválido.").max(160).optional(),
  phone: z.string().trim().min(1).max(40).optional(),
  note: z.string().trim().min(1).max(280).optional(),
});

export const publishNeedBody = z.object({
  title: z.string().trim().min(1, "Indica un título.").max(140),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(NEED_PRIORITIES),
  address: z.string().trim().min(3, "Indica una dirección o zona.").max(200),
  items: z.array(itemSchema).min(1, "Agrega al menos un artículo.").max(20),
  author: authorSchema.optional(),
});

type PublishNeedInput = z.infer<typeof publishNeedBody>;

function toNewNeed(input: PublishNeedInput): NewNeed {
  return {
    title: input.title,
    description: input.description ?? null,
    priority: input.priority,
    address: input.address,
    items: input.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit ?? null,
      category: item.category,
    })),
    author: input.author
      ? {
          name: input.author.name ?? null,
          email: input.author.email ?? null,
          phone: input.author.phone ?? null,
          note: input.author.note ?? null,
          verified: false, // captación anónima: la identidad no se verifica
          source: AUTHOR_SOURCE,
        }
      : null,
  };
}

export async function enqueueNeedHandler(req: Request, res: Response): Promise<void> {
  if (!env.RESPONSEGRID_API_KEY) {
    throw serviceUnavailable("La publicación de necesidades no está configurada.");
  }
  const key = req.get("Idempotency-Key");
  if (key && key.length > 200) throw badRequest("Idempotency-Key es demasiado largo.");
  try {
    const jobId = await enqueueNeedPublication(
      { need: toNewNeed(req.body as PublishNeedInput) },
      key,
    );
    res.status(202).set("Cache-Control", "no-store").json({ queued: true, jobId });
  } catch (error) {
    throw serviceUnavailable(
      error instanceof Error ? error.message : "No se pudo encolar la necesidad.",
    );
  }
}

export async function needStatusHandler(req: Request, res: Response): Promise<void> {
  try {
    const state = await getNeedPublicationState(String(req.params.jobId));
    if (!state) {
      throw notFound("Publicación no encontrada.");
    }
    res.set("Cache-Control", "no-store").json(state);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw serviceUnavailable("No se pudo consultar la publicación.");
  }
}
