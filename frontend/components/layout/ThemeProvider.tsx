"use client";

import { useEffect } from "react";

const STORAGE_KEY = "terremoto:theme";

/**
 * Aplica el tema en `<html data-dark>`. Por defecto el sitio es claro: solo se
 * activa el modo oscuro si la persona lo eligió explícitamente (localStorage).
 * Mientras no exista un botón de cambio en la UI, esto mantiene el sitio en
 * blanco aunque el sistema del visitante esté en modo oscuro.
 */
export default function ThemeProvider() {
  useEffect(() => {
    const root = document.documentElement;
    const stored = localStorage.getItem(STORAGE_KEY);
    root.dataset.dark = stored === "dark" ? "true" : "false";
  }, []);

  return null;
}

/** Alterna tema claro/oscuro y persiste la elección. */
export function toggleTheme(): void {
  const root = document.documentElement;
  const next = root.dataset.dark !== "true";
  root.dataset.dark = next ? "true" : "false";
  localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
}
