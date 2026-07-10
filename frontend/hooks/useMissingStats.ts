"use client";

/**
 * Store compartido de /api/missing/stats (patrón dashboard estándar: UNA fuente
 * de datos fan-out a N componentes). Antes, HeroDesktopNav + MobileStickyNav +
 * EmergencyApp (+ HeroStats/HeroPeopleLinks/PersonsTabs en otras rutas) hacían
 * CADA UNO su propio fetch + setInterval(60s) → 3-5 requests idénticas y 3-5
 * timers para el mismo dato.
 *
 * Implementado con useSyncExternalStore (la forma recomendada en React 19 para
 * suscribirse a un store externo — es lo que usan SWR/react-query por dentro,
 * sin meter una dependencia nueva). Un solo poll, ref-counted: arranca con el
 * primer suscriptor y se detiene con el último; se pausa con la pestaña oculta.
 */
import { useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/api";

export interface MissingStats {
  active: number;
  found: number;
  total: number;
  onMap: number;
}

const POLL_MS = 60_000;

let snapshot: MissingStats | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight: Promise<void> | null = null;
let visibilityBound = false;

function emit() {
  for (const l of listeners) l();
}

async function fetchOnce(): Promise<void> {
  // Coalesce: si ya hay un fetch en vuelo, reusamos esa promesa (dedup real
  // aunque varios suscriptores monten en el mismo tick).
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await apiFetch("/api/missing/stats", { cache: "no-cache" });
      if (!res.ok) return;
      const data = await res.json();
      const s = data?.stats;
      if (!s) return;
      const next: MissingStats = {
        active: s.active ?? 0,
        found: s.found ?? 0,
        total: s.total ?? 0,
        onMap: s.onMap ?? 0,
      };
      // Solo emitimos si algo cambió (evita re-renders inútiles).
      if (
        !snapshot ||
        snapshot.active !== next.active ||
        snapshot.found !== next.found ||
        snapshot.total !== next.total ||
        snapshot.onMap !== next.onMap
      ) {
        snapshot = next;
        emit();
      }
    } catch {
      // se reintenta en el próximo tick
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function startTimer() {
  if (timer !== null) return;
  void fetchOnce();
  timer = setInterval(() => {
    if (document.visibilityState === "visible") void fetchOnce();
  }, POLL_MS);
}

function stopTimer() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

function onVisibility() {
  if (document.visibilityState === "visible" && listeners.size > 0) {
    void fetchOnce(); // refresco inmediato al volver a la pestaña
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    startTimer();
    if (!visibilityBound) {
      document.addEventListener("visibilitychange", onVisibility);
      visibilityBound = true;
    }
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopTimer();
      if (visibilityBound) {
        document.removeEventListener("visibilitychange", onVisibility);
        visibilityBound = false;
      }
    }
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => null; // SSR: sin datos hasta hidratar

/** Devuelve los conteos de desaparecidos compartidos (o null hasta el 1er fetch). */
export function useMissingStats(): MissingStats | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
