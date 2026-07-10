"use client";

/**
 * Cloudflare Turnstile — patrón recomendado para SPA (render EXPLÍCITO + token
 * por-submit + reset). Prueba de humanidad: el widget genera un token de UN SOLO
 * USO (caduca a 300s) que el backend verifica en `requireHuman` (Siteverify).
 *
 * Uso en un formulario:
 *   const turnstile = useTurnstile();
 *   ...
 *   <div ref={turnstile.mountRef} />          // donde quieras el widget (managed/invisible)
 *   ...
 *   const token = await turnstile.getToken();   // en el submit, token FRESCO
 *   await mutate({ ...payload, turnstileToken: token });
 *
 * `getToken()`:
 *  - devuelve el token actual si ya existe, o espera al challenge si está pendiente;
 *  - tras leerlo, hace `reset()` para que el PRÓXIMO submit obtenga uno nuevo
 *    (los tokens son de un solo uso — sin reset, el 2º envío fallaría con 403).
 *  - sin SITE KEY (dev/local) devuelve "" → el backend tampoco exige Turnstile.
 *
 * SITE KEY público (NEXT_PUBLIC_*, se inlinea en build).
 */
import { useCallback, useEffect, useRef } from "react";

export const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileAPI {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      theme?: "auto" | "light" | "dark";
      appearance?: "always" | "execute" | "interaction-only";
    },
  ) => string;
  getResponse: (id: string) => string | undefined;
  reset: (id: string) => void;
  remove: (id: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileAPI;
  }
}

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("No se pudo cargar Turnstile"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export interface UseTurnstile {
  /** Callback-ref: pásalo a un <div> donde montar el widget. Nombre != "ref"
   *  a propósito (el lint react-hooks/refs marca cualquier `.ref` en render). */
  mountRef: (el: HTMLDivElement | null) => void;
  /** Token FRESCO para este submit; resetea el widget tras leerlo. "" si no hay site key. */
  getToken: () => Promise<string>;
  /** True si Turnstile está activo (hay site key). */
  enabled: boolean;
}

export function useTurnstile(): UseTurnstile {
  const elRef = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  const tokenRef = useRef<string>("");
  // Resolvers esperando un token mientras el challenge está pendiente.
  const waiters = useRef<((t: string) => void)[]>([]);

  const onToken = useCallback((token: string) => {
    tokenRef.current = token;
    const ws = waiters.current;
    waiters.current = [];
    ws.forEach((resolve) => resolve(token));
  }, []);

  const mount = useCallback(
    (el: HTMLDivElement | null) => {
      elRef.current = el;
      if (!el || !TURNSTILE_SITE_KEY) return;
      loadScript()
        .then(() => {
          if (!elRef.current || !window.turnstile || widgetId.current) return;
          widgetId.current = window.turnstile.render(elRef.current, {
            sitekey: TURNSTILE_SITE_KEY,
            appearance: "interaction-only", // invisible salvo que CF pida reto
            theme: "auto",
            callback: onToken,
            "expired-callback": () => {
              tokenRef.current = "";
            },
            "error-callback": () => {
              tokenRef.current = "";
            },
          });
        })
        .catch(() => {
          /* si el script no carga, getToken() devuelve "" y el POST dará 403 */
        });
    },
    [onToken],
  );

  useEffect(() => {
    return () => {
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, []);

  const getToken = useCallback(async (): Promise<string> => {
    if (!TURNSTILE_SITE_KEY) return ""; // dev/local: backend tampoco lo exige
    // Token ya disponible -> úsalo y resetea para el próximo submit.
    if (tokenRef.current) {
      const t = tokenRef.current;
      tokenRef.current = "";
      if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
      return t;
    }
    // Challenge pendiente (o aún cargando): espera el callback, con timeout.
    return new Promise<string>((resolve) => {
      let settled = false;
      const finish = (t: string) => {
        if (settled) return;
        settled = true;
        tokenRef.current = "";
        if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
        resolve(t);
      };
      waiters.current.push(finish);
      // No colgar el submit indefinidamente si el reto nunca resuelve.
      setTimeout(() => finish(tokenRef.current || ""), 8000);
    });
  }, []);

  return { mountRef: mount, getToken, enabled: Boolean(TURNSTILE_SITE_KEY) };
}
