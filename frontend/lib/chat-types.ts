export type ChatRole =
  | "rescuer"
  | "medic"
  | "volunteer"
  | "coordinator"
  | "ngo"
  | "citizen";

export interface ChatRoleMeta {
  label: string;
  description: string;
  color: string;
  icon: string;
}

export const CHAT_ROLES: Record<ChatRole, ChatRoleMeta> = {
  rescuer: {
    label: "Rescatista",
    description: "Equipo de rescate en campo",
    color: "#ea580c",
    icon: "🦺",
  },
  medic: {
    label: "Médico",
    description: "Personal de salud",
    color: "#dc2626",
    icon: "🩺",
  },
  volunteer: {
    label: "Voluntario",
    description: "Logística y suministros",
    color: "#16a34a",
    icon: "🤝",
  },
  coordinator: {
    label: "Coordinador",
    description: "Dirige operaciones",
    color: "#1e40af",
    icon: "📡",
  },
  ngo: {
    label: "ONG / Org.",
    description: "Cruz Roja, ONGs, etc.",
    color: "#9333ea",
    icon: "🏥",
  },
  citizen: {
    label: "Ciudadano",
    description: "Afectado o familiar",
    color: "#475569",
    icon: "🏠",
  },
};

export const CHAT_ROLE_KEYS = Object.keys(CHAT_ROLES) as ChatRole[];

export function isValidChatRole(role: string): role is ChatRole {
  return role in CHAT_ROLES;
}

export function getRoleMeta(role: ChatRole): ChatRoleMeta {
  return CHAT_ROLES[role];
}

export interface ChatMessage {
  id: string;
  name: string;
  role: ChatRole;
  text: string;
  createdAt: number;
  /** Id del mensaje al que responde, si aplica. */
  replyTo: string | null;
  /** Vista previa del mensaje respondido: "Nombre: texto...". */
  replyPreview: string | null;
  /** Id del mensaje raíz del hilo (el ancestro más antiguo). */
  threadRootId: string;
  /** Última actividad del hilo; se usa para ordenar como WhatsApp. */
  threadBumpedAt: number;
}
