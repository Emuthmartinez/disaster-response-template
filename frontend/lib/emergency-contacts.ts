/**
 * Directorio de teléfonos de emergencia mostrado en /telefonos y en la sección
 * "Teléfonos de emergencia" de la home.
 *
 * CUSTOMIZE ME: reemplaza los grupos/contactos de ejemplo de abajo con los
 * números reales de emergencia (bomberos, ambulancias, protección civil,
 * etc.) para la región de este deployment. `disaster-configure` no puede
 * generar esta lista automáticamente — cada país/región tiene su propio
 * esquema de numeración de emergencias.
 */

export interface EmergencyContact {
  name: string;
  numbers: string[];
}

export interface EmergencyContactGroup {
  title: string;
  icon: string;
  contacts: EmergencyContact[];
}

export const EMERGENCY_CONTACT_GROUPS: EmergencyContactGroup[] = [
  {
    title: "Emergencias (línea directa)",
    icon: "🚨",
    contacts: [{ name: "Línea de emergencia general (ejemplo)", numbers: ["911"] }],
  },
  {
    title: "Ambulancias",
    icon: "🚑",
    contacts: [
      {
        name: "Servicio de ambulancia de ejemplo",
        numbers: ["+00 000 000 0000"],
      },
    ],
  },
];
