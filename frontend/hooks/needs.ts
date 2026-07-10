"use client";

// Mutación para publicar una necesidad (POST /api/needs), con sus catálogos de UI.
import { useMutation } from "@tanstack/react-query";
import { apiSend } from "@/lib/api";

export const NEED_PRIORITIES = [
  { value: "urgent", label: "Urgente" },
  { value: "high", label: "Alta" },
  { value: "medium", label: "Media" },
  { value: "low", label: "Baja" },
] as const;

export const NEED_CATEGORIES = [
  { value: "food", label: "Alimentos" },
  { value: "water", label: "Agua" },
  { value: "medicines", label: "Medicinas" },
  { value: "medical_supplies", label: "Insumos médicos" },
  { value: "medical_equipment", label: "Equipo médico" },
  { value: "medical_personnel", label: "Personal médico" },
  { value: "medical", label: "Atención médica" },
  { value: "hygiene", label: "Higiene" },
  { value: "clothing", label: "Ropa" },
  { value: "shelter", label: "Refugio" },
  { value: "tools", label: "Herramientas" },
  { value: "other", label: "Otro" },
] as const;

export type NeedPriority = (typeof NEED_PRIORITIES)[number]["value"];
export type NeedCategory = (typeof NEED_CATEGORIES)[number]["value"];

export interface NeedItemInput {
  name: string;
  quantity: number;
  unit?: string;
  category: NeedCategory;
}

/** Contacto opcional del solicitante. */
export interface NeedAuthorInput {
  name?: string;
  email?: string;
  phone?: string;
  note?: string;
}

export interface PublishNeedInput {
  title: string;
  description?: string;
  priority: NeedPriority;
  address: string;
  items: NeedItemInput[];
  author?: NeedAuthorInput;
  turnstileToken?: string; // prueba de humanidad (Turnstile) para el backend
}

export interface PublishNeedResult {
  need?: { id: string; status: string };
}

export function usePublishNeed() {
  return useMutation({
    mutationFn: (input: PublishNeedInput) =>
      apiSend<PublishNeedResult>("POST", "/api/needs", input),
  });
}
