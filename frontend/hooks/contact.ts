"use client";

/**
 * Hooks de datos del dominio "contact". Mismo patrón canónico que hooks/missing.ts.
 *
 *  - mutación: useMutation + apiSend; el contrato JSON espeja el del backend.
 *  - NADA de fetch/setState a mano en el componente: solo este hook.
 *
 * El contacto es fire-and-forget (no hay lecturas que listar), por eso solo
 * exporta una mutación. qk.contact.all queda para invalidación futura si algún
 * día se lista el buzón en el cliente.
 */
import { useMutation } from "@tanstack/react-query";
import { apiSend } from "@/lib/api";

export interface ContactInput {
  name: string;
  email: string;
  subject: string;
  message: string;
  turnstileToken?: string; // prueba de humanidad (Turnstile) para el backend
}

export interface ContactResponse {
  message?: string;
}

export function useContactSubmit() {
  return useMutation({
    mutationFn: (input: ContactInput) =>
      apiSend<ContactResponse>("POST", "/api/contact", input),
  });
}
