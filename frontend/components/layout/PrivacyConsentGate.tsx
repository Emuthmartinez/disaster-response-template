"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import PrivacyConsentModal from "@/components/content/PrivacyConsentModal";
import { PRIVACY_CONSENT_STORAGE_KEY } from "@/lib/privacy-policy";

const OVERLAY_SELECTOR = "[data-privacy-gate-overlay]";

function hasStoredConsent(): boolean {
  try {
    return localStorage.getItem(PRIVACY_CONSENT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Gate de consentimiento de privacidad + trampa anti-manipulación.
 *
 * Envuelve el contenido de la página. Mientras el consentimiento está PENDIENTE,
 * muestra el modal (overlay a pantalla completa). Si alguien intenta saltarse el
 * gate borrando el overlay desde el inspector (DevTools), lo detectamos con un
 * MutationObserver y RETIRAMOS todo el contenido (children) reemplazándolo por un
 * aviso de bloqueo — "si borras el modal, se borra la landing".
 *
 * ⚠️ ALCANCE HONESTO: esto es un DISUASIVO de UX/legal, no un control de
 * seguridad. Cualquier control en el cliente es evitable (desactivar JS, editar
 * el estado de React, bloquear el observer, o llamar a la API directo). La
 * aplicación REAL del consentimiento y del anti-abuso vive en el backend
 * (Turnstile + rate-limit + validación por endpoint). Esto solo sube el costo de
 * la manipulación trivial desde el navegador.
 */
export default function PrivacyConsentGate({ children }: { children: ReactNode }) {
  // Modal visible (consentimiento pendiente). Arranca en false para que el SSR y
  // el primer render pinten la landing normal (SEO / no romper first paint); el
  // efecto de abajo lo abre tras montar si no hay consentimiento guardado.
  const [open, setOpen] = useState(false);
  // Manipulación detectada → se retira la landing y se muestra el aviso.
  const [blocked, setBlocked] = useState(false);

  // Refs para que el observer no dependa de re-renders:
  const grantedRef = useRef(false); // el usuario aceptó (cierre legítimo)
  const seenOverlayRef = useRef(false); // el overlay llegó a existir en el DOM

  useEffect(() => {
    if (hasStoredConsent()) {
      grantedRef.current = true;
      return;
    }
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const handleAccept = useCallback(() => {
    try {
      localStorage.setItem(PRIVACY_CONSENT_STORAGE_KEY, "1");
    } catch {
      // Si localStorage falla, cerramos igual para no bloquear en entornos restringidos.
    }
    grantedRef.current = true; // marca ANTES de cerrar: el observer ignora el unmount legítimo
    setOpen(false);
  }, []);

  // Trampa anti-manipulación: activa solo mientras el modal debe estar abierto.
  useEffect(() => {
    if (!open) return;
    if (typeof MutationObserver === "undefined") return;

    const overlayPresent = () => document.querySelector(OVERLAY_SELECTOR) !== null;
    let raf = 0;

    const evaluate = () => {
      if (grantedRef.current) return; // cierre legítimo por aceptar
      if (overlayPresent()) {
        seenOverlayRef.current = true; // el overlay ya se pintó (portal montado)
        return;
      }
      // El overlay NO está. Solo es manipulación si ANTES llegó a existir (evita
      // falsos positivos en el gap inicial entre setOpen(true) y el portal).
      if (!seenOverlayRef.current) return;
      // Confirma en el siguiente frame (descarta parpadeos transitorios del DOM).
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!grantedRef.current && !overlayPresent()) setBlocked(true);
      });
    };

    const observer = new MutationObserver(evaluate);
    observer.observe(document.body, { childList: true, subtree: true });
    // Chequeo inicial por si el portal ya montó antes de conectar el observer.
    evaluate();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [open]);

  if (blocked) {
    return (
      <div
        role="alertdialog"
        aria-modal="true"
        className="fixed inset-0 z-[2147483647] flex flex-col items-center justify-center gap-4 bg-slate-950 px-6 text-center text-slate-100"
      >
        <h1 className="text-xl font-bold sm:text-2xl">Contenido no disponible</h1>
        <p className="max-w-md text-sm text-slate-300">
          Se detectó una manipulación de la página. Para usar el sitio debes
          aceptar la Política de Privacidad. Recarga la página para continuar.
        </p>
        <button
          type="button"
          onClick={() => location.reload()}
          className="rounded-xl bg-sky-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-sky-500"
        >
          Recargar página
        </button>
      </div>
    );
  }

  return (
    <>
      {children}
      <PrivacyConsentModal open={open} onAccept={handleAccept} />
    </>
  );
}
