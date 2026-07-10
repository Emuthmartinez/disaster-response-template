import type { MetadataRoute } from "next";
import { serverApiGet } from "@/lib/server-api";
import { buildHospitalSlug, type Hospital } from "@/lib/hospitals-meta";
import { SITE_URL } from "@/lib/site";

// Refresca el sitemap cada hora para reflejar altas/bajas de hospitales sin
// necesidad de un redeploy completo.
export const revalidate = 3600;

// Fecha de construcción estable. Se actualiza solo al hacer build, para que
// lastModified no cambie en cada petición.
const BUILD_DATE = new Date();

// Rutas públicas estáticas. Se excluyen a propósito /admin (panel interno),
// /chat (herramienta efímera de voluntarios) y /api/* (endpoints no indexables).
const STATIC_PATHS = [
  { path: "/", changeFrequency: "hourly" as const, priority: 1 },
  { path: "/hospitales", changeFrequency: "hourly" as const, priority: 0.9 },
  { path: "/telefonos", changeFrequency: "weekly" as const, priority: 0.8 },
  { path: "/guia", changeFrequency: "weekly" as const, priority: 0.8 },
  { path: "/acopio", changeFrequency: "daily" as const, priority: 0.7 },
  { path: "/publicar-necesidad", changeFrequency: "weekly" as const, priority: 0.7 },
  { path: "/riesgo-sismico", changeFrequency: "monthly" as const, priority: 0.6 },
  { path: "/privacidad", changeFrequency: "yearly" as const, priority: 0.3 },
  { path: "/terminos", changeFrequency: "yearly" as const, priority: 0.3 },
  { path: "/contacto", changeFrequency: "monthly" as const, priority: 0.5 },
  { path: "/quienes-somos", changeFrequency: "monthly" as const, priority: 0.5 },
  { path: "/donaciones", changeFrequency: "monthly" as const, priority: 0.6 },
  { path: "/voluntario", changeFrequency: "monthly" as const, priority: 0.6 },
  { path: "/apoyo-disponible", changeFrequency: "weekly" as const, priority: 0.7 },
] as const;

const API_TIMEOUT_MS = 5_000;

async function listHospitalsWithTimeout(): Promise<Hospital[]> {
  return Promise.race([
    serverApiGet<{ hospitals: Hospital[] }>("/api/hospitals?limit=1000").then(
      (data) => data.hospitals ?? [],
    ),
    new Promise<Hospital[]>((resolve) =>
      setTimeout(() => resolve([]), API_TIMEOUT_MS),
    ),
  ]);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = BUILD_DATE;

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((entry) => ({
    url: `${SITE_URL}${entry.path}`,
    lastModified,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));

  let hospitalEntries: MetadataRoute.Sitemap = [];
  try {
    const hospitals = await listHospitalsWithTimeout();
    hospitalEntries = hospitals.map((hospital) => ({
      url: `${SITE_URL}/hospitales/${buildHospitalSlug(hospital)}`,
      // Fecha real de alta del hospital en vez de la fecha de build compartida:
      // señal de frescura más precisa por entidad. No es "última edición" (el
      // backend aún no expone updatedAt para hospitales) — sigue siendo un
      // proxy, no una fecha de modificación exacta.
      lastModified: hospital.createdAt ? new Date(hospital.createdAt) : lastModified,
      changeFrequency: "daily",
      priority: 0.6,
    }));
  } catch {
    // Si la base de datos no está disponible al generar el sitemap, servimos
    // solo las rutas estáticas en vez de romper el build.
    hospitalEntries = [];
  }

  return [...staticEntries, ...hospitalEntries];
}
