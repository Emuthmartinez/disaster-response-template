/**
 * Enrutado de Cron Triggers (U4).
 *
 * Test unitario puro — no toca red ni base de datos. No se importa
 * `src/worker.ts`: crea un servidor HTTP e importa `cloudflare:node` en ámbito
 * de módulo, y ninguna de las dos cosas existe bajo Node. Por eso la decisión
 * de enrutado vive en `services/cron-jobs.ts`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CRON_EARTHQUAKES,
  CRON_EXPRESSIONS,
  CRON_GEOCODE,
  dispatchCron,
} from "@/services/cron-jobs";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("dispatchCron", () => {
  it("enruta la expresión de sismos a su handler y a ningún otro", async () => {
    const sismos = vi.fn(async () => {});
    const geocode = vi.fn(async () => {});

    await dispatchCron(CRON_EARTHQUAKES, 1_700_000_000_000, {
      [CRON_EARTHQUAKES]: sismos,
      [CRON_GEOCODE]: geocode,
    });

    expect(sismos).toHaveBeenCalledOnce();
    expect(sismos).toHaveBeenCalledWith(1_700_000_000_000);
    expect(geocode).not.toHaveBeenCalled();
  });

  it("enruta la expresión de geocode a su handler y a ningún otro", async () => {
    const sismos = vi.fn(async () => {});
    const geocode = vi.fn(async () => {});

    await dispatchCron(CRON_GEOCODE, 1_700_000_000_000, {
      [CRON_EARTHQUAKES]: sismos,
      [CRON_GEOCODE]: geocode,
    });

    expect(geocode).toHaveBeenCalledOnce();
    expect(sismos).not.toHaveBeenCalled();
  });

  it("una expresión desconocida avisa y vuelve, sin lanzar", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sismos = vi.fn(async () => {});

    await expect(
      dispatchCron("0 3 * * *", 1_700_000_000_000, {
        [CRON_EARTHQUAKES]: sismos,
      }),
    ).resolves.toBeUndefined();

    expect(sismos).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain("0 3 * * *");
  });

  it("propaga el fallo del handler (el reintento de Cloudflare es deseable)", async () => {
    const boom = vi.fn(async () => {
      throw new Error("USGS caído");
    });

    await expect(
      dispatchCron(CRON_EARTHQUAKES, 1, { [CRON_EARTHQUAKES]: boom }),
    ).rejects.toThrow("USGS caído");
  });
});

describe("wrangler.jsonc", () => {
  /**
   * El fallo real que este test persigue no es un typo: es editar una lista sin
   * la otra. Un cron declarado en el JSON y no en el código no ejecuta nada y
   * NO falla de forma visible — solo deja de pasar lo que debía pasar.
   */
  it("declara exactamente las expresiones que el código enruta", () => {
    const path = fileURLToPath(new URL("../wrangler.jsonc", import.meta.url));
    const raw = readFileSync(path, "utf8");
    // wrangler.jsonc lleva comentarios de línea; se quitan para poder parsear.
    const config = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "")) as {
      triggers?: { crons?: string[] };
    };

    expect(config.triggers?.crons).toEqual([...CRON_EXPRESSIONS]);
  });

  it("no declara `routes` (aborta el deploy tras subir el codigo)", () => {
    const path = fileURLToPath(new URL("../wrangler.jsonc", import.meta.url));
    const raw = readFileSync(path, "utf8");
    const config = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "")) as Record<
      string,
      unknown
    >;

    expect(config).not.toHaveProperty("routes");
  });
});
