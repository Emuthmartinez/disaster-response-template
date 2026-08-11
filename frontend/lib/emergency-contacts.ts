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
import { deploymentConfig } from "@/lib/deployment-config";

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

/**
 * Número de emergencia primario para mostrar en pistas/estados vacíos (p.ej.
 * "todavía no hay hospitales cargados; si es una emergencia, llama al ...").
 *
 * NUNCA hardcodear un número aquí ni en el componente que lo consume: se
 * prioriza `deploymentConfig.emergencyNumber` (config/deployment.config.json,
 * campo opcional) y, si no está configurado, se cae al primer número del
 * primer grupo de EMERGENCY_CONTACT_GROUPS de arriba. Devuelve `null` solo si
 * ninguna de las dos fuentes tiene nada — el consumidor debe manejar ese caso
 * con una frase genérica en vez de omitir el número.
 */
export function getPrimaryEmergencyNumber(): string | null {
  if (deploymentConfig.emergencyNumber) return deploymentConfig.emergencyNumber;
  return EMERGENCY_CONTACT_GROUPS[0]?.contacts[0]?.numbers[0] ?? null;
}
