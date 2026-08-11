/**
 * La FRONTERA de lo que se reintenta es la parte peligrosa de src/db/retry.ts,
 * no el reintento en si. Estos tests la fijan a proposito:
 *
 *  - un 5xx CON respuesta prueba que la sentencia no se ejecuto -> reintentar
 *    cualquier cosa es seguro;
 *  - un `fetch` que LANZA no prueba nada -> solo se reintentan lecturas.
 *
 * Si alguien afloja esto en el futuro ("ya que estamos, reintentemos tambien los
 * errores de red") estos tests tienen que ponerse en rojo: reintentar a ciegas
 * un INSERT duplicaria un reporte de persona desaparecida.
 */
import { describe, expect, it, vi } from "vitest";
import { isProvablyReadOnly, retryingFetch } from "@/db/retry";

/** Cuerpo tal como lo manda el driver HTTP de Neon. */
const body = (query: string) => JSON.stringify({ query, params: [] });

const ok = () => new Response("{}", { status: 200 });
const boom = () => new Response("nope", { status: 503 });

describe("isProvablyReadOnly", () => {
  it("acepta un SELECT normal", () => {
    expect(isProvablyReadOnly(body("SELECT id FROM missing_persons"))).toBe(true);
  });

  it("acepta un SELECT con saltos de linea y mayusculas mezcladas", () => {
    expect(isProvablyReadOnly(body("\n  SeLeCt count(*)\n  FROM hospitals\n"))).toBe(true);
  });

  it("RECHAZA un INSERT", () => {
    expect(isProvablyReadOnly(body("INSERT INTO missing_persons (id) VALUES ($1)"))).toBe(
      false,
    );
  });

  it("RECHAZA un CTE que empieza por WITH y acaba escribiendo", () => {
    expect(
      isProvablyReadOnly(body("WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x")),
    ).toBe(false);
  });

  it("RECHAZA un SELECT que esconde una escritura mas adelante", () => {
    // El caso que mata a un regex ingenuo de "empieza por select".
    expect(
      isProvablyReadOnly(body("SELECT * FROM t; DELETE FROM missing_persons")),
    ).toBe(false);
  });

  it("RECHAZA un cuerpo que no es JSON, o sin query, o ausente", () => {
    expect(isProvablyReadOnly("SELECT 1")).toBe(false);
    expect(isProvablyReadOnly(JSON.stringify({ params: [] }))).toBe(false);
    expect(isProvablyReadOnly(undefined)).toBe(false);
  });
});

describe("retryingFetch", () => {
  it("no reintenta cuando la respuesta es buena", async () => {
    const f = vi.fn(ok);
    const res = await retryingFetch("u", { body: body("SELECT 1") }, f as never);
    expect(f).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });

  it("reintenta un 5xx incluso en una ESCRITURA (el proxy prueba que no corrio)", async () => {
    const f = vi.fn().mockResolvedValueOnce(boom()).mockResolvedValueOnce(ok());
    const res = await retryingFetch(
      "u",
      { body: body("INSERT INTO missing_persons (id) VALUES ($1)") },
      f as never,
    );
    expect(f).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it("reintenta un error de red en una LECTURA", async () => {
    const f = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(ok());
    const res = await retryingFetch("u", { body: body("SELECT 1") }, f as never);
    expect(f).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it("NO reintenta un error de red en una ESCRITURA (podria duplicarla)", async () => {
    const f = vi.fn().mockRejectedValue(new Error("network"));
    await expect(
      retryingFetch(
        "u",
        { body: body("INSERT INTO missing_persons (id) VALUES ($1)") },
        f as never,
      ),
    ).rejects.toThrow("network");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("reintenta UNA sola vez: 2 intentos como maximo, nunca 3", async () => {
    // Acota la amplificacion contra un proxy que ya esta sufriendo: el cliente
    // ya reintenta hasta 3 veces por su cuenta.
    const f = vi.fn().mockResolvedValue(boom());
    const res = await retryingFetch("u", { body: body("SELECT 1") }, f as never);
    expect(f).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(503);
  });
});
