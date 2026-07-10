/**
 * Recurso `api/public/roles` — CONFIG declarativa sobre la fábrica CRUD.
 *
 * Roles RBAC: encaja en el cuarteto read/create/edit/delete de la fábrica. La
 * lista hija de capacidades (role_capabilities) y la protección de roles de
 * sistema viven en el service; aquí solo van capacidad + esquemas + ops.
 */
import { z } from "zod";
import { type CrudResource } from "@/public-api/crud-factory";
import * as service from "@/services/roles";

// Una capacidad es una cadena tipo "report:read". El service valida contra el
// catálogo (assertKnownCapabilities); aquí solo forma básica.
const capabilityKey = z.string().trim().min(3).max(64);

const createSchema = z.object({
  name: z.string().trim().min(1, "Indica un nombre.").max(80),
  description: z.string().trim().max(280).optional(),
  capabilities: z.array(capabilityKey).default([]),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(280).optional(),
    capabilities: z.array(capabilityKey).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, "Envía al menos un campo a actualizar.");

const responseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  isSystem: z.boolean(),
  capabilities: z.array(z.string()),
  createdAt: z.number(),
  updatedAt: z.number().nullable(),
});

export const rolesResource: CrudResource<
  service.RoleDTO,
  service.RoleDTO,
  z.infer<typeof createSchema>,
  z.infer<typeof updateSchema>
> = {
  capability: "role",
  schemas: { create: createSchema, update: updateSchema, response: responseSchema },
  ops: {
    list: () => service.listRoles(),
    get: (id) => service.getRoleById(id),
    create: (input) =>
      service.createRole({
        name: input.name,
        description: input.description,
        capabilities: input.capabilities,
      }),
    update: (id, input) => service.updateRole(id, input),
    remove: (id) => service.removeRole(id),
  },
};
