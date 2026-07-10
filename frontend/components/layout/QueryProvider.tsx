"use client";

import { useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/get-query-client";

/**
 * Provider de TanStack Query. El QueryClient se crea UNA vez por montaje del
 * árbol cliente (useState con inicializador), no en cada render ni en el módulo
 * (evita compartir cache entre requests SSR). Envuelve la app en layout.tsx.
 */
export default function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
