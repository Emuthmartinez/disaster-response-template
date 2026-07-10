import { describe, it, expect } from "vitest";
import { formatLocaleNumber, timeAgo, distanceMeters, freshnessClass } from "@/lib/format";

// Helpers de display usados en tarjetas de reportes y mapa. Deterministas:
// se les pasa `now` explícito para no depender del reloj.

const NOW = 1_700_000_000_000;
const SEC = 1_000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatLocaleNumber", () => {
  it("formatea con locale es", () => {
    expect(formatLocaleNumber(12345)).toMatch(/12[.\s]?345/);
  });
});

describe("timeAgo", () => {
  it("'ahora mismo' para diffs < 30s y para timestamps futuros", () => {
    expect(timeAgo(NOW, NOW)).toBe("ahora mismo");
    expect(timeAgo(NOW + 5 * SEC, NOW)).toBe("ahora mismo"); // futuro → clamp a 0
  });

  it("escala a segundos / minutos / horas / días", () => {
    expect(timeAgo(NOW - 45 * SEC, NOW)).toBe("hace 45 s");
    expect(timeAgo(NOW - 5 * MIN, NOW)).toBe("hace 5 min");
    expect(timeAgo(NOW - 3 * HOUR, NOW)).toBe("hace 3 h");
    expect(timeAgo(NOW - 2 * DAY, NOW)).toBe("hace 2 d");
  });
});

describe("distanceMeters", () => {
  it("es 0 para el mismo punto", () => {
    expect(distanceMeters({ lat: 10.5, lng: -66.9 }, { lat: 10.5, lng: -66.9 })).toBe(0);
  });

  it("~111 km por grado de longitud en el ecuador", () => {
    const d = distanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it("es simétrica", () => {
    const a = { lat: 10.4, lng: -66.9 };
    const b = { lat: 8.6, lng: -71.1 };
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 6);
  });
});

describe("freshnessClass", () => {
  it("verde <1h, azul <24h, gris para lo más viejo", () => {
    expect(freshnessClass(NOW - 10 * MIN, NOW)).toBe("text-emerald-600");
    expect(freshnessClass(NOW - 5 * HOUR, NOW)).toBe("text-sky-600");
    expect(freshnessClass(NOW - 3 * DAY, NOW)).toBe("text-slate-400");
  });
});
