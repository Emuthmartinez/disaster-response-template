/**
 * Catálogo FIJO de capacidades (la unidad atómica de autorización).
 *
 * Una capability es `recurso:verbo`. Cada endpoint de `api/public/*` declara la
 * que exige (deny-by-default). Este catálogo es la fuente de verdad: se siembra
 * en la tabla `capabilities` por migración y NO lo crean usuarios. Los ROLES
 * (filas en DB que admins crean) agrupan estas capacidades; además se pueden
 * conceder individualmente vía `permission_grants`.
 *
 * Convención: CRUD por modelo = read | create | edit | delete. Más un puñado de
 * capacidades transversales (auth, audit) que gobiernan el propio motor.
 *
 * Para añadir un modelo nuevo: agrégalo a MODELS y corre `db:generate` + el seed.
 */

/** Verbos CRUD estándar que todo modelo de datos expone en `api/public/*`. */
export const CRUD_VERBS = ["read", "create", "edit", "delete"] as const;
export type CrudVerb = (typeof CRUD_VERBS)[number];

/**
 * Modelos de datos con superficie CRUD en `api/public/*`. La key es el prefijo
 * de la capability y del path del router (`api/public/<model>`); category agrupa
 * en la UI de admin.
 */
export const MODELS: { key: string; category: string; label: string }[] = [
  { key: "report", category: "reports", label: "Reportes de emergencia" },
  { key: "missing", category: "missing", label: "Personas desaparecidas" },
  { key: "hospital", category: "hospitals", label: "Hospitales" },
  { key: "patient", category: "hospitals", label: "Pacientes de hospital" },
  { key: "donation", category: "donations", label: "Donaciones / acopio" },
  { key: "chat", category: "chat", label: "Mensajes de chat" },
  { key: "contact", category: "contact", label: "Mensajes de contacto" },
];

/**
 * Capacidades transversales (no son CRUD de un modelo de datos): gobiernan el
 * motor de auth y la bitácora. Son las que `requireCapability` exige en los
 * endpoints de administración de usuarios/roles/grants.
 */
export const CROSS_CUTTING: { key: string; category: string; description: string }[] = [
  // Importación de pacientes hospitalarios (staging + procesado + apply). No es
  // un verbo CRUD estándar: gobierna toda la superficie de `patient-imports`.
  {
    key: "patient:import",
    category: "hospitals",
    description: "Importar pacientes hospitalarios (staging, validación y apply)",
  },
  { key: "user:invite", category: "auth", description: "Invitar usuarios nuevos" },
  { key: "user:read", category: "auth", description: "Ver usuarios" },
  { key: "user:edit", category: "auth", description: "Editar usuarios (estado, rol)" },
  { key: "user:delete", category: "auth", description: "Desactivar/eliminar usuarios" },
  { key: "role:read", category: "auth", description: "Ver roles" },
  { key: "role:create", category: "auth", description: "Crear roles" },
  { key: "role:edit", category: "auth", description: "Editar roles (capacidades incluidas)" },
  { key: "role:delete", category: "auth", description: "Eliminar roles" },
  { key: "grant:read", category: "auth", description: "Ver grants de capacidades" },
  { key: "grant:manage", category: "auth", description: "Conceder/revocar capacidades individuales" },
  { key: "audit:read", category: "audit", description: "Ver la bitácora de auditoría" },
  // Self-service: gestionar TUS PROPIAS API keys. Se siembra en todos los roles
  // (cualquier usuario invitado puede crear sus llaves). Revocar llaves AJENAS es
  // potestad del admin semilla (no necesita esta cap). Es capability — no "solo
  // autenticado" — para encajar en el deny-by-default del repo y poder quitársela
  // a un rol restringido si hiciera falta (least-privilege).
  { key: "apikey:manage", category: "auth", description: "Crear y revocar tus propias API keys" },
  // Acceso a la RÉPLICA PÚBLICA (hub SQL, RFC 0006): emitir/revocar credenciales
  // de consumidor (rol Postgres + password + IP en el firewall). Es la capacidad
  // MÁS sensible (abre un puerto público + crea credenciales de DB), así que NO
  // se siembra en ningún rol por defecto y tiene un CORTE especial en resolve.ts:
  // se exige incluso al admin semilla, que debe tener además el flag de super
  // admin (users.is_super_admin). Ver MIRROR_MANAGE + userHasCapability.
  { key: "mirror:manage", category: "auth", description: "Emitir/revocar acceso a la réplica pública (SQL hub)" },
];

/** Capacidad que gobierna el acceso a la réplica pública. Gateada a super admin. */
export const MIRROR_MANAGE = "mirror:manage";

export interface CapabilityDef {
  key: string;
  description: string;
  category: string;
}

/** Construye el catálogo completo: CRUD por modelo + transversales. */
function buildCatalog(): CapabilityDef[] {
  const verbLabel: Record<CrudVerb, string> = {
    read: "Ver",
    create: "Crear",
    edit: "Editar",
    delete: "Eliminar",
  };
  const crud = MODELS.flatMap((m) =>
    CRUD_VERBS.map((verb) => ({
      key: `${m.key}:${verb}`,
      category: m.category,
      description: `${verbLabel[verb]} ${m.label.toLowerCase()}`,
    })),
  );
  return [...crud, ...CROSS_CUTTING];
}

/** El catálogo completo, inmutable. */
export const CAPABILITIES: readonly CapabilityDef[] = Object.freeze(buildCatalog());

/** Set de keys válidas — para validar que un endpoint exige una capability real. */
export const CAPABILITY_KEYS: ReadonlySet<string> = new Set(CAPABILITIES.map((c) => c.key));

/** True si la key existe en el catálogo (usado por requireCapability en dev). */
export function isKnownCapability(key: string): boolean {
  return CAPABILITY_KEYS.has(key);
}

/** Nombre del rol semilla (admin total). Inmutable: no se borra ni se le quitan caps. */
export const SYSTEM_ADMIN_ROLE = "admin";
