"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Placeholder mientras la sección no ha entrado en viewport (reserva alto
   *  para no provocar layout shift al montar el contenido real). */
  fallback?: ReactNode;
  /** Margen extra del observer: empieza a montar ANTES de que la sección sea
   *  visible, para que el contenido pesado (p. ej. el mapa Leaflet + tiles) esté
   *  listo al llegar. Por defecto 400px de "readiness". */
  rootMargin?: string;
  /** Alto mínimo reservado por el placeholder (evita CLS). */
  minHeight?: number | string;
  className?: string;
}

/**
 * Difiere el montaje de una sección hasta que se acerca al viewport
 * (IntersectionObserver). Una vez visible, se monta y NO se vuelve a desmontar.
 *
 * Pensado para secciones below-the-fold y pesadas (mapa, paneles con polling):
 * mantiene fuera del trabajo inicial todo lo que el usuario aún no ve, sin
 * sacrificar la disponibilidad — el `rootMargin` generoso pre-carga con
 * antelación para que esté listo al llegar.
 *
 * Degradación: si no hay IntersectionObserver (navegador viejo / SSR), monta de
 * inmediato — nunca esconde contenido por falta de la API.
 */
export function LazySection({
  children,
  fallback = null,
  rootMargin = "400px",
  minHeight = 320,
  className,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Arranca false en server y client por igual (sin mismatch de hidratación).
  // El efecto decide: con observer, monta al acercarse; sin él, monta ya.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;

    // Sin soporte (navegador viejo): monta ya, no penalizar por falta de API.
    // setState aquí es intencional (fallback raro, una sola vez) y no se puede
    // hacer en el init del estado sin romper la hidratación SSR.
    if (typeof IntersectionObserver === "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(true);
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visible, rootMargin]);

  return (
    <div ref={ref} className={className}>
      {visible ? children : <div style={{ minHeight }}>{fallback}</div>}
    </div>
  );
}
