/**
 * Fixtures de DEMO para desarrollo local (NO producción).
 *
 * Reglas:
 *  - TODAS las filas llevan `id` con prefijo `DEMO-`. Esa marca es la que usa el
 *    runner (index.ts) para distinguir datos demo de un dump real y NO mezclar.
 *  - Self-contained: la imagen del backend NO copia `frontend/`, así que los
 *    hospitales se embeben aquí.
 *  - Datos 100% SINTÉTICOS: ciudades, hospitales y personas son ficticios (sin
 *    atar el template a ningún país/evento real). Genera este seed cuando
 *    adaptes el template a tu propio despliegue si quieres coordenadas reales
 *    de tu región — las de aquí son solo un rectángulo de demostración.
 *    Timestamps relativos a `now`.
 */

export const DEMO_PREFIX = "DEMO-";

const pick = <T>(arr: readonly T[], i: number): T =>
  arr[((i % arr.length) + arr.length) % arr.length]!;

const MIN = 60_000;
const HOUR = 60 * MIN;

// Ciudades FICTICIAS con coords de demostración: una grilla 4x3 de offsets
// redondos (sin decimales significativos) alrededor de un origen neutral
// (0, 0), sin atar el template a ningún país/región real. Se les aplica un
// jitter determinista por índice.
const GRID_ORIGIN_LAT = 0;
const GRID_ORIGIN_LNG = 0;
const CITIES = [
  { name: "Ciudad Central", lat: GRID_ORIGIN_LAT - 1.5, lng: GRID_ORIGIN_LNG - 2 },
  { name: "Bahía Norte", lat: GRID_ORIGIN_LAT - 0.5, lng: GRID_ORIGIN_LNG - 2 },
  { name: "Villa Verde", lat: GRID_ORIGIN_LAT + 0.5, lng: GRID_ORIGIN_LNG - 2 },
  { name: "Puerto Alto", lat: GRID_ORIGIN_LAT + 1.5, lng: GRID_ORIGIN_LNG - 2 },
  { name: "Villa Marina", lat: GRID_ORIGIN_LAT - 1.5, lng: GRID_ORIGIN_LNG },
  { name: "Ciudad Este", lat: GRID_ORIGIN_LAT - 0.5, lng: GRID_ORIGIN_LNG },
  { name: "Río Claro", lat: GRID_ORIGIN_LAT + 0.5, lng: GRID_ORIGIN_LNG },
  { name: "Monte Azul", lat: GRID_ORIGIN_LAT + 1.5, lng: GRID_ORIGIN_LNG },
  { name: "Villa Oeste", lat: GRID_ORIGIN_LAT - 1.5, lng: GRID_ORIGIN_LNG + 2 },
  { name: "Costa Larga", lat: GRID_ORIGIN_LAT - 0.5, lng: GRID_ORIGIN_LNG + 2 },
  { name: "Ciudad Sur", lat: GRID_ORIGIN_LAT + 0.5, lng: GRID_ORIGIN_LNG + 2 },
  { name: "Puerto Nuevo", lat: GRID_ORIGIN_LAT + 1.5, lng: GRID_ORIGIN_LNG + 2 },
] as const;

const jitterLat = (base: number, i: number) => base + ((i % 7) - 3) * 0.012;
const jitterLng = (base: number, i: number) => base + ((i % 5) - 2) * 0.012;

const REPORT_TYPES = [
  "critical",
  "supplies",
  "shelter",
  "nopower",
  "missing",
  "building",
  "starlink",
] as const;

const NEEDS_BY_TYPE: Record<(typeof REPORT_TYPES)[number], string> = {
  critical: "Personas atrapadas, se necesita rescate urgente y ambulancia.",
  supplies: "Falta agua potable, alimentos no perecederos y medicinas.",
  shelter: "Familias sin techo, se requiere refugio temporal y cobijas.",
  nopower: "Sin electricidad desde hace horas, equipos médicos en riesgo.",
  missing: "Familiar desaparecido tras el sismo, se busca información.",
  building: "Estructura con grietas graves, riesgo de colapso.",
  starlink: "Punto con internet Starlink disponible para coordinación.",
};

const FIRST_NAMES = [
  "María", "José", "Carmen", "Luis", "Ana", "Carlos", "Rosa", "Pedro",
  "Andrea", "Miguel", "Gabriela", "Jesús", "Daniela", "Rafael", "Valentina",
  "Francisco", "Isabel", "Antonio", "Sofía", "Manuel",
] as const;

const LAST_NAMES = [
  "González", "Rodríguez", "Pérez", "Hernández", "García", "Martínez",
  "López", "Sánchez", "Ramírez", "Torres", "Flores", "Rivas", "Mendoza",
  "Castillo", "Romero", "Suárez", "Blanco", "Guerrero",
] as const;

export interface DemoReport {
  id: string;
  type: string;
  lat: number;
  lng: number;
  place: string;
  affected: number;
  needs: string;
  confirmations: number;
  createdAt: number;
}

export interface DemoMissing {
  id: string;
  name: string;
  age: number | null;
  nationality: string;
  description: string;
  lastSeen: string;
  contact: string;
  status: string;
  lat: number | null;
  lng: number | null;
  resolvedAt: number | null;
  resolutionNote: string | null;
  createdAt: number;
}

export interface DemoHospital {
  id: string;
  externalId: string;
  name: string;
  facilityType: string;
  state: string;
  municipality: string;
  address: string;
  level: string | null;
  priorityZone: string;
  isPriority: boolean;
  createdAt: number;
}

export interface DemoPatient {
  id: string;
  hospitalId: string;
  name: string;
  age: number | null;
  condition: string;
  status: string;
  notes: string;
  contact: string;
  admittedAt: number;
  updatedAt: number;
}

export interface DemoSupplyStatus {
  id: string;
  hospitalId: string;
  category: string;
  status: string;
  publicNote: string;
  lastUpdatedAt: number;
  lastConfirmedAt: number;
  createdAt: number;
}

export interface DemoSupplyNeed {
  id: string;
  hospitalId: string;
  category: string;
  itemType: string;
  quantity: number | null;
  unit: string;
  urgency: string;
  status: string;
  publicNote: string;
  lastConfirmedAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface DemoDonation {
  id: string;
  name: string;
  amountUsd: number;
  status: string;
  createdAt: number;
}

export interface DemoChat {
  id: string;
  name: string;
  role: string;
  text: string;
  threadBumpedAt: number;
  createdAt: number;
}

// Hospitales FICTICIOS de demostración (mezcla de "estados"/municipios
// inventados + algunos marcados como prioritarios). Reemplaza este bloque con
// el directorio real de tu propio despliegue.
const HOSPITAL_SEED: Array<Omit<DemoHospital, "id" | "externalId" | "createdAt">> = [
  { name: "Hospital Central Uno", facilityType: "hospital", state: "Región Central", municipality: "Distrito Uno", address: "Ciudad Universitaria, Sector Uno, Ciudad Central", level: "IV", priorityZone: "P0", isPriority: true },
  { name: "Hospital General Dos", facilityType: "hospital", state: "Región Central", municipality: "Distrito Uno", address: "Sector Dos, Ciudad Central", level: "III", priorityZone: "P0", isPriority: true },
  { name: "Hospital de Niños Tres", facilityType: "hospital_pediatrico", state: "Región Central", municipality: "Distrito Uno", address: "Sector Tres, Ciudad Central", level: "IV", priorityZone: "P0", isPriority: true },
  { name: "Hospital General Cuatro", facilityType: "hospital_ivss", state: "Región Central", municipality: "Distrito Uno", address: "Av. Intercomunal, Ciudad Central", level: "III", priorityZone: "P1", isPriority: true },
  { name: "Maternidad Central", facilityType: "maternidad", state: "Región Central", municipality: "Distrito Uno", address: "Sector Cuatro, Ciudad Central", level: "III", priorityZone: "P1", isPriority: true },
  { name: "Hospital General Cinco", facilityType: "hospital_ivss", state: "Región Norte", municipality: "Distrito Dos", address: "El Llano, Ciudad Central", level: "III", priorityZone: "P1", isPriority: true },
  { name: "Hospital Universitario de Bahía Norte", facilityType: "hospital", state: "Región Norte", municipality: "Bahía Norte", address: "Av. Principal, Bahía Norte", level: "IV", priorityZone: "P1", isPriority: true },
  { name: "Hospital Central de Villa Marina", facilityType: "hospital", state: "Región Este", municipality: "Villa Marina", address: "Av. Central, Villa Marina", level: "III", priorityZone: "P2", isPriority: false },
  { name: "Hospital Central de Villa Verde", facilityType: "hospital", state: "Región Oeste", municipality: "Villa Verde", address: "Av. Mayor, Villa Verde", level: "III", priorityZone: "P2", isPriority: false },
  { name: "Hospital Central de Puerto Alto", facilityType: "hospital", state: "Región Oeste", municipality: "Puerto Alto", address: "Av. Segunda, Puerto Alto", level: "IV", priorityZone: "P2", isPriority: false },
  { name: "Hospital Universitario de Monte Azul", facilityType: "hospital", state: "Región Sur", municipality: "Monte Azul", address: "Av. Tercera, Monte Azul", level: "IV", priorityZone: "P2", isPriority: false },
  { name: "Hospital Central de Villa Oeste", facilityType: "hospital", state: "Región Sur", municipality: "Villa Oeste", address: "Av. Cuarta, Villa Oeste", level: "III", priorityZone: "P2", isPriority: false },
  { name: "Hospital General de Costa Larga", facilityType: "hospital", state: "Región Este", municipality: "Costa Larga", address: "Av. Quinta, Costa Larga", level: "III", priorityZone: "P2", isPriority: false },
  { name: "Hospital Universitario de Río Claro", facilityType: "hospital", state: "Región Este", municipality: "Río Claro", address: "Av. Sexta, Río Claro", level: "III", priorityZone: "P3", isPriority: false },
  { name: "Hospital General de Ciudad Sur", facilityType: "hospital", state: "Región Sur", municipality: "Ciudad Sur", address: "Ciudad Sur", level: "III", priorityZone: "P3", isPriority: false },
  { name: "Hospital de Ciudad Este", facilityType: "hospital", state: "Región Este", municipality: "Ciudad Este", address: "Puerto Interior, Ciudad Este", level: "III", priorityZone: "P3", isPriority: false },
  { name: "Hospital General de Costa Larga Sur", facilityType: "hospital", state: "Región Este", municipality: "Costa Larga", address: "Costa Larga Sur", level: "II", priorityZone: "P3", isPriority: false },
  { name: "CDI Sector Siete", facilityType: "cdi", state: "Región Central", municipality: "Distrito Uno", address: "Sector Siete, Ciudad Central", level: "I", priorityZone: "P2", isPriority: false },
  { name: "Hospital Militar Central", facilityType: "hospital_militar", state: "Región Central", municipality: "Distrito Uno", address: "Sector Cuatro, Ciudad Central", level: "militar", priorityZone: "P1", isPriority: true },
  { name: "Hospital General de Puerto Nuevo", facilityType: "hospital", state: "Región Oeste", municipality: "Puerto Nuevo", address: "Puerto Nuevo", level: "II", priorityZone: "P3", isPriority: false },
];

const SUPPLY_CATEGORIES = [
  "medications", "iv_fluids", "medical_supplies", "water", "beds_capacity", "lab_diagnostics",
] as const;
const SUPPLY_STATUS = ["green", "yellow", "red"] as const;
const PATIENT_CONDITION = ["stable", "serious", "critical", "recovering"] as const;
const PATIENT_STATUS = ["hospitalized", "hospitalized", "recovering", "transferred"] as const;

export interface DemoData {
  reports: DemoReport[];
  missing: DemoMissing[];
  hospitals: DemoHospital[];
  patients: DemoPatient[];
  supplyStatuses: DemoSupplyStatus[];
  supplyNeeds: DemoSupplyNeed[];
  donations: DemoDonation[];
  chat: DemoChat[];
}

export function buildFixtures(now: number): DemoData {
  const reports: DemoReport[] = Array.from({ length: 200 }, (_, i) => {
    const city = pick(CITIES, i);
    const type = pick(REPORT_TYPES, i);
    return {
      id: `${DEMO_PREFIX}report-${i + 1}`,
      type,
      lat: jitterLat(city.lat, i),
      lng: jitterLng(city.lng, i + 2),
      place: `${city.name} — sector ${(i % 12) + 1}`,
      affected: (i % 9) * 3,
      needs: NEEDS_BY_TYPE[type],
      confirmations: i % 5,
      createdAt: now - i * 17 * MIN,
    };
  });

  const missing: DemoMissing[] = Array.from({ length: 120 }, (_, i) => {
    const city = pick(CITIES, i + 1);
    const found = i % 6 === 0;
    const hasCoords = i % 5 !== 0; // ~80% en el mapa
    return {
      id: `${DEMO_PREFIX}missing-${i + 1}`,
      name: `${pick(FIRST_NAMES, i)} ${pick(LAST_NAMES, i + 3)}`,
      age: i % 11 === 0 ? null : 5 + (i % 80),
      nationality: i % 4 === 0 ? "Nacionalidad Ejemplo B" : "Nacionalidad Ejemplo A",
      description: "Visto por última vez tras el sismo. Cualquier información es valiosa.",
      lastSeen: `${city.name}, cerca de la plaza central`,
      contact: `+00 4${(10 + (i % 89))}-${1000000 + i}`,
      status: found ? "found" : "active",
      lat: hasCoords ? jitterLat(city.lat, i + 1) : null,
      lng: hasCoords ? jitterLng(city.lng, i + 3) : null,
      resolvedAt: found ? now - i * HOUR : null,
      resolutionNote: found ? "Reportado a salvo por un familiar." : null,
      createdAt: now - i * 33 * MIN,
    };
  });

  const hospitals: DemoHospital[] = HOSPITAL_SEED.map((h, i) => ({
    id: `${DEMO_PREFIX}hosp-${i + 1}`,
    externalId: `${DEMO_PREFIX}HOSP-${String(i + 1).padStart(3, "0")}`,
    createdAt: now - i * 2 * HOUR,
    ...h,
  }));

  // Pacientes + suministros para los primeros 6 hospitales.
  const detailed = hospitals.slice(0, 6);
  const patients: DemoPatient[] = [];
  const supplyStatuses: DemoSupplyStatus[] = [];
  const supplyNeeds: DemoSupplyNeed[] = [];
  detailed.forEach((h, hi) => {
    const nPatients = 4 + (hi % 4);
    for (let p = 0; p < nPatients; p++) {
      const k = hi * 10 + p;
      patients.push({
        id: `${DEMO_PREFIX}patient-${k + 1}`,
        hospitalId: h.id,
        name: `${pick(FIRST_NAMES, k + 2)} ${pick(LAST_NAMES, k)}`,
        age: k % 9 === 0 ? null : 1 + (k % 90),
        condition: pick(PATIENT_CONDITION, k),
        status: pick(PATIENT_STATUS, k),
        notes: "Ingresado tras el sismo; en observación.",
        contact: k % 3 === 0 ? "" : `+00 412-${2000000 + k}`,
        admittedAt: now - (k + 1) * 5 * HOUR,
        updatedAt: now - (k + 1) * 2 * HOUR,
      });
    }
    // Una fila de status por categoría (índice único hospital+category).
    SUPPLY_CATEGORIES.forEach((category, ci) => {
      supplyStatuses.push({
        id: `${DEMO_PREFIX}supply-${hi}-${ci}`,
        hospitalId: h.id,
        category,
        status: pick(SUPPLY_STATUS, hi + ci),
        publicNote: "Estado reportado por el equipo operativo.",
        lastUpdatedAt: now - (ci + 1) * HOUR,
        lastConfirmedAt: now - (ci + 1) * HOUR,
        createdAt: now - 6 * HOUR,
      });
    });
    // Un par de necesidades por hospital.
    for (let nd = 0; nd < 2; nd++) {
      const ci = (hi + nd) % SUPPLY_CATEGORIES.length;
      supplyNeeds.push({
        id: `${DEMO_PREFIX}need-${hi}-${nd}`,
        hospitalId: h.id,
        category: pick(SUPPLY_CATEGORIES, ci),
        itemType: nd === 0 ? "Solución fisiológica 0.9%" : "Gasas estériles",
        quantity: 50 + nd * 100,
        unit: nd === 0 ? "litros" : "cajas",
        urgency: nd === 0 ? "red" : "yellow",
        status: "active",
        publicNote: "Se agradece cualquier donación verificable.",
        lastConfirmedAt: now - (nd + 1) * HOUR,
        createdAt: now - 5 * HOUR,
        updatedAt: now - (nd + 1) * HOUR,
      });
    }
  });

  const donations: DemoDonation[] = Array.from({ length: 30 }, (_, i) => ({
    id: `${DEMO_PREFIX}donation-${i + 1}`,
    name: i % 7 === 0 ? "Anónimo" : `${pick(FIRST_NAMES, i + 5)} ${pick(LAST_NAMES, i + 1)}`,
    amountUsd: ((i % 10) + 1) * 500, // céntimos (USD 5–50)
    status: "intent",
    createdAt: now - i * 90 * MIN,
  }));

  const chatTexts = [
    "Equipo en camino al sector afectado, confirmen punto de encuentro.",
    "Necesitamos voluntarios con vehículo para traslado de insumos.",
    "Hay un refugio operativo cerca de la plaza, capacidad para 40 personas.",
    "¿Alguien tiene contacto con bomberos de la zona?",
    "Llevamos agua y medicinas; indiquen dirección exacta.",
    "Reporte confirmado, ya pasó la cuadrilla de rescate.",
  ];
  const chat: DemoChat[] = Array.from({ length: 40 }, (_, i) => ({
    id: `${DEMO_PREFIX}chat-${i + 1}`,
    name: i % 5 === 0 ? "Anónimo" : `${pick(FIRST_NAMES, i + 7)}`,
    role: "ciudadano",
    text: pick(chatTexts, i),
    threadBumpedAt: now - i * 11 * MIN,
    createdAt: now - i * 11 * MIN,
  }));

  return { reports, missing, hospitals, patients, supplyStatuses, supplyNeeds, donations, chat };
}
