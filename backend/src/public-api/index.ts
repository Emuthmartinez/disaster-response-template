/**
 * Punto de montaje de la superficie `api/public/*` (integraciones + admin).
 *
 * Cada recurso es un router CRUD generado por la fábrica a partir de su config.
 * `mountPublicApi(app)` los cuelga bajo `/api/public/*`. El router de auth
 * (login/invite/me) se monta aparte porque no es un CRUD de modelo.
 *
 * Para añadir un modelo: crea `resources/<modelo>.resource.ts` con su CONFIG y
 * regístralo en RESOURCES abajo (config) — el router y la doc OpenAPI se derivan
 * solos de esa config. Nada más.
 */
import type { Express } from "express";
import { createCrudRouter, type CrudResource } from "@/public-api/crud-factory";
import { authRouter } from "@/routes/auth";
import { patientImportsRouter } from "@/public-api/patient-imports";
import { reportsResource } from "@/public-api/resources/reports.resource";
import { missingResource } from "@/public-api/resources/missing.resource";
import { hospitalsResource } from "@/public-api/resources/hospitals.resource";
import { patientsResource } from "@/public-api/resources/patients.resource";
import { donationsResource } from "@/public-api/resources/donations.resource";
import { chatResource } from "@/public-api/resources/chat.resource";
import { contactResource } from "@/public-api/resources/contact.resource";
import { rolesResource } from "@/public-api/resources/roles.resource";
// Routers RBAC escritos a mano (verbos irregulares que no encajan en la fábrica).
import { usersRouter } from "@/public-api/routers/users.router";
import { grantsRouter } from "@/public-api/routers/grants.router";
import { auditRouter } from "@/public-api/routers/audit.router";
import { capabilitiesRouter } from "@/public-api/routers/capabilities.router";
import { apiKeysRouter } from "@/public-api/routers/api-keys.router";
import { hubCredentialsRouter } from "@/public-api/routers/hub-credentials.router";

/**
 * Registro path → CONFIG del recurso. Fuente de verdad ÚNICA: de aquí salen
 * tanto los routers (createCrudRouter) como la doc OpenAPI (buildCrudOpenApiPaths).
 */
// Los recursos tienen parámetros de tipo distintos (algunos sin update -> never),
// así que el registro los guarda con los genéricos en `unknown` (la fábrica solo
// necesita la forma, no los tipos exactos, para montar y documentar).
type AnyResource = CrudResource<unknown, unknown, unknown, unknown>;
export const PUBLIC_RESOURCES: Record<string, AnyResource> = {
  reports: reportsResource as AnyResource,
  missing: missingResource as AnyResource,
  hospitals: hospitalsResource as AnyResource,
  patients: patientsResource as AnyResource,
  donations: donationsResource as AnyResource,
  chat: chatResource as AnyResource,
  contact: contactResource as AnyResource,
  // RBAC: roles encaja en el cuarteto CRUD (read/create/edit/delete) → fábrica.
  roles: rolesResource as AnyResource,
};

export function mountPublicApi(app: Express): void {
  // Auth (no CRUD de modelo): login, invite, accept, me, logout, reset.
  app.use("/api/public/auth", authRouter);
  // Importación de pacientes (#151): no es CRUD de modelo, router escrito a mano
  // pero deny-by-default con patient:import en cada ruta.
  app.use("/api/public/patient-imports", patientImportsRouter);
  // Recursos CRUD — un router generado por recurso desde su config.
  for (const [path, resource] of Object.entries(PUBLIC_RESOURCES)) {
    app.use(`/api/public/${path}`, createCrudRouter(resource));
  }
  // RBAC con verbos irregulares (no CRUD): routers a mano. Cada ruta lleva
  // rateLimit + requireCapability + writeAudit (gates que exige el ESLint).
  app.use("/api/public/users", usersRouter); // user:read/edit/delete (invite→auth)
  app.use("/api/public/grants", grantsRouter); // grant:read/manage
  app.use("/api/public/audit", auditRouter); // audit:read
  app.use("/api/public/capabilities", capabilitiesRouter); // role:read (catálogo p/ UI)
  app.use("/api/public/api-keys", apiKeysRouter); // apikey:manage (self-service)
  app.use("/api/public/hub-credentials", hubCredentialsRouter); // mirror:manage (super admin)
}
