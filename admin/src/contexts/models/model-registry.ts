/**
 * Registro de los modelos administrables (read-only en F1).
 *
 * Fuente de verdad ÚNICA del dashboard para: el path del backend
 * (/api/public/<path>), la capacidad que lo gatea (<path>:read), la etiqueta de
 * navegación y las columnas a mostrar. Espeja PUBLIC_RESOURCES del backend.
 *
 * Añadir un modelo nuevo = una entrada aquí (YAGNI: sin archivos por modelo
 * mientras la vista sea una tabla read-only genérica; cuando un modelo necesite
 * lógica de dominio propia, se extrae a su bounded-context dedicado).
 */

export interface ModelColumn {
  /** Clave del campo en el DTO del backend. */
  key: string;
  /** Encabezado visible. */
  label: string;
}

export interface ModelField {
  key: string;
  label: string;
  type?: "text" | "number";
  required?: boolean;
}

export interface ModelConfig {
  /** Segmento de ruta: /api/public/<path> y /[path] en el dashboard. */
  path: string;
  /** Etiqueta de navegación (es). */
  label: string;
  /** Capacidad de lectura que lo gatea. */
  readCapability: string;
  /** Columnas a renderizar (las que existan en el DTO; el resto se ignora). */
  columns: ModelColumn[];
  capabilityRoot: string;
  createFields?: ModelField[];
  editFields?: ModelField[];
  canDelete?: boolean;
}

// Orden = orden en la navegación.
export const MODELS = [
  {
    path: "reports",
    label: "Reportes",
    readCapability: "report:read",
    capabilityRoot: "report",
    columns: [
      { key: "id", label: "ID" },
      { key: "type", label: "Tipo" },
      { key: "place", label: "Lugar" },
      { key: "affected", label: "Afectados" },
      { key: "confirmations", label: "Confirmaciones" },
    ],
    createFields: [
      { key: "type", label: "Tipo", required: true },
      { key: "lat", label: "Latitud", type: "number", required: true },
      { key: "lng", label: "Longitud", type: "number", required: true },
      { key: "place", label: "Lugar", required: true },
      { key: "affected", label: "Afectados", type: "number" },
      { key: "needs", label: "Necesidades" },
    ],
    editFields: [
      { key: "type", label: "Tipo" },
      { key: "lat", label: "Latitud", type: "number" },
      { key: "lng", label: "Longitud", type: "number" },
      { key: "place", label: "Lugar" },
      { key: "affected", label: "Afectados", type: "number" },
      { key: "needs", label: "Necesidades" },
    ],
    canDelete: true,
  },
  {
    path: "missing",
    label: "Desaparecidos",
    readCapability: "missing:read",
    capabilityRoot: "missing",
    columns: [
      { key: "id", label: "ID" },
      { key: "name", label: "Nombre" },
      { key: "lastSeen", label: "Última ubicación" },
      { key: "status", label: "Estado" },
    ],
    createFields: [
      { key: "name", label: "Nombre", required: true },
      { key: "age", label: "Edad", type: "number" },
      { key: "nationality", label: "Nacionalidad" },
      { key: "description", label: "Descripción" },
      { key: "lastSeen", label: "Última ubicación" },
      { key: "contact", label: "Contacto" },
    ],
    editFields: [
      { key: "name", label: "Nombre" },
      { key: "age", label: "Edad", type: "number" },
      { key: "nationality", label: "Nacionalidad" },
      { key: "description", label: "Descripción" },
      { key: "lastSeen", label: "Última ubicación" },
      { key: "contact", label: "Contacto" },
    ],
    canDelete: true,
  },
  {
    path: "hospitals",
    label: "Hospitales",
    readCapability: "hospital:read",
    capabilityRoot: "hospital",
    columns: [
      { key: "id", label: "ID" },
      { key: "name", label: "Nombre" },
      { key: "state", label: "Estado" },
      { key: "municipality", label: "Municipio" },
    ],
    createFields: [
      { key: "name", label: "Nombre", required: true },
      { key: "facilityType", label: "Tipo" },
      { key: "state", label: "Estado", required: true },
      { key: "municipality", label: "Municipio" },
      { key: "address", label: "Dirección" },
    ],
    editFields: [
      { key: "name", label: "Nombre" },
      { key: "facilityType", label: "Tipo" },
      { key: "state", label: "Estado" },
      { key: "municipality", label: "Municipio" },
      { key: "address", label: "Dirección" },
    ],
    canDelete: true,
  },
  {
    path: "patients",
    label: "Pacientes",
    readCapability: "patient:read",
    capabilityRoot: "patient",
    columns: [
      { key: "id", label: "ID" },
      { key: "name", label: "Nombre" },
      { key: "hospitalId", label: "Hospital" },
      { key: "status", label: "Estado" },
    ],
    createFields: [
      { key: "hospitalId", label: "Hospital ID", required: true },
      { key: "name", label: "Nombre", required: true },
      { key: "age", label: "Edad", type: "number" },
      { key: "condition", label: "Condición" },
      { key: "status", label: "Estado" },
      { key: "notes", label: "Notas" },
      { key: "contact", label: "Contacto" },
    ],
    editFields: [
      { key: "name", label: "Nombre" },
      { key: "age", label: "Edad", type: "number" },
      { key: "condition", label: "Condición" },
      { key: "status", label: "Estado" },
      { key: "notes", label: "Notas" },
      { key: "contact", label: "Contacto" },
    ],
    canDelete: true,
  },
  {
    path: "donations",
    label: "Donaciones",
    readCapability: "donation:read",
    capabilityRoot: "donation",
    columns: [
      { key: "id", label: "ID" },
      { key: "name", label: "Nombre" },
      { key: "amountCents", label: "Monto (centavos)" },
    ],
    createFields: [
      { key: "name", label: "Nombre", required: true },
      { key: "amountCents", label: "Monto (centavos)", type: "number", required: true },
    ],
  },
  {
    path: "chat",
    label: "Chat",
    readCapability: "chat:read",
    capabilityRoot: "chat",
    columns: [
      { key: "id", label: "ID" },
      { key: "name", label: "Autor" },
      { key: "text", label: "Mensaje" },
    ],
    createFields: [
      { key: "name", label: "Autor" },
      { key: "text", label: "Mensaje", required: true },
      { key: "role", label: "Rol" },
      { key: "replyTo", label: "Respuesta a" },
    ],
    canDelete: true,
  },
  {
    path: "contact",
    label: "Contacto",
    readCapability: "contact:read",
    capabilityRoot: "contact",
    columns: [
      { key: "id", label: "ID" },
      { key: "name", label: "Nombre" },
      { key: "subject", label: "Asunto" },
      { key: "read", label: "Leído" },
    ],
    createFields: [
      { key: "name", label: "Nombre", required: true },
      { key: "email", label: "Correo", required: true },
      { key: "subject", label: "Asunto", required: true },
      { key: "message", label: "Mensaje", required: true },
    ],
    editFields: [{ key: "read", label: "Leído (true)", required: true }],
  },
] as const satisfies readonly ModelConfig[];

export type ModelPath = (typeof MODELS)[number]["path"];

export function getModel(path: string): ModelConfig | undefined {
  return MODELS.find((m) => m.path === path);
}
