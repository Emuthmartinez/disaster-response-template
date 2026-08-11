"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import PrivacyConsentModal from "@/components/content/PrivacyConsentModal";
import { PRIVACY_CONSENT_STORAGE_KEY } from "@/lib/privacy-policy";

function hasStoredConsent(): boolean {
  try {
    return localStorage.getItem(PRIVACY_CONSENT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

interface PrivacyConsentApi {
  /**
   * Pide consentimiento ANTES de enviar datos. Si ya se dio, resuelve `true` sin
   * mostrar nada. Si no, abre el modal y resuelve cuando el usuario decide:
   * `true` si acepta, `false` si cierra sin aceptar (entonces NO se envia).
   */
  ensureConsent: () => Promise<boolean>;
  /** ¿Hay consentimiento guardado? Para pintar avisos, no como control. */
  hasConsent: () => boolean;
}

const PrivacyConsentContext = createContext<PrivacyConsentApi>({
  ensureConsent: async () => true,
  hasConsent: () => false,
});

export function usePrivacyConsent(): PrivacyConsentApi {
  return useContext(PrivacyConsentContext);
}

/**
 * Consentimiento de privacidad, exigido al ENVIAR datos — no al leer.
 *
 * POR QUE CAMBIO (importa, no es cosmetica):
 *
 * Antes esto era un overlay a pantalla completa que aparecia al cargar y tapaba
 * el sitio entero hasta que la persona se desplazaba por toda la politica y
 * aceptaba. En un sitio de respuesta a un terremoto eso significa que alguien
 * buscando a un familiar, o los telefonos de emergencia, o el mapa del
 * epicentro, tenia que leerse un documento legal primero. Ese es exactamente el
 * momento en que la gente cierra la pestaña.
 *
 * La obligacion legal es dar consentimiento informado antes de PUBLICAR datos
 * personales — no antes de leer informacion publica de emergencia. Asi que el
 * gate se mueve al punto de envio:
 *
 *   - Leer (mapa, telefonos, hospitales, acopio, guia): sin friccion.
 *   - Enviar (reportes, personas desaparecidas, necesidades, contacto, chat):
 *     `ensureConsent()` antes del submit; si no acepta, no se envia.
 *
 * Se conserva el requisito de desplazarse hasta el final antes de habilitar el
 * boton: cuando el modal aparece, aparece completo.
 *
 * ALCANCE HONESTO: sigue siendo un control de cliente, evitable. La aplicacion
 * real del anti-abuso vive en el backend (rate-limit, validacion por endpoint y
 * Turnstile cuando este reactivado). Se retiro la "trampa anti-manipulacion"
 * que borraba la landing si alguien quitaba el overlay con DevTools: castigaba
 * a quien inspecciona la pagina y no frenaba a nadie que llame la API directo,
 * y con el modal ya fuera del camino de lectura no tiene nada que proteger.
 */
export default function PrivacyConsentGate({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // Resolver de la promesa que espera el formulario que pidio consentimiento.
  const pendingRef = useRef<((granted: boolean) => void) | null>(null);

  const settle = useCallback((granted: boolean) => {
    const resolve = pendingRef.current;
    pendingRef.current = null;
    setOpen(false);
    resolve?.(granted);
  }, []);

  const ensureConsent = useCallback(() => {
    if (hasStoredConsent()) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      // Si ya habia otra peticion abierta, se cancela: solo un envio a la vez.
      pendingRef.current?.(false);
      pendingRef.current = resolve;
      setOpen(true);
    });
  }, []);

  const handleAccept = useCallback(() => {
    try {
      localStorage.setItem(PRIVACY_CONSENT_STORAGE_KEY, "1");
    } catch {
      // Si localStorage falla (modo privado, storage bloqueado) igual seguimos:
      // la persona acepto, y volver a preguntarle en el siguiente envio es
      // preferible a impedirle reportar.
    }
    settle(true);
  }, [settle]);

  const handleDismiss = useCallback(() => settle(false), [settle]);

  return (
    <PrivacyConsentContext.Provider value={{ ensureConsent, hasConsent: hasStoredConsent }}>
      {children}
      <PrivacyConsentModal open={open} onAccept={handleAccept} onDismiss={handleDismiss} />
    </PrivacyConsentContext.Provider>
  );
}
