/**
 * Seam de despacho de jobs (U1): elige transporte por CAPACIDAD.
 *
 * Test unitario puro — NO requiere el stack local. config/env.ts exige
 * DATABASE_URL, así que se fija antes del import dinámico del módulo bajo
 * prueba; nunca se abre una conexión.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://demo:demo@localhost:5432/demo";

const ROUTE = { queueName: "needs-publication", binding: "NEEDS_QUEUE" } as const;

type Dispatch = typeof import("@/lib/job-dispatch");

async function loadDispatch(): Promise<Dispatch> {
  const mod = await import("@/lib/job-dispatch");
  mod.resetJobBindings();
  return mod;
}

function fakeProducer() {
  return { send: vi.fn(async () => {}) };
}

describe("job-dispatch", () => {
  beforeEach(() => {
    delete process.env.VALKEY_URL;
  });

  it("usa el binding de Queues cuando está registrado y no hay VALKEY_URL", async () => {
    const { registerJobBindings, resolveTransport, dispatchJob } = await loadDispatch();
    const producer = fakeProducer();
    registerJobBindings({ NEEDS_QUEUE: producer, SOME_STRING: "no-soy-una-cola" });

    expect(resolveTransport(ROUTE)).toBe("queues");

    await dispatchJob(ROUTE, { need: "agua" }, { id: "need-abc" });
    // Que send se haya llamado prueba que NO se tomó la rama BullMQ: esa rama
    // habría intentado construir un cliente de Redis contra un host inexistente.
    expect(producer.send).toHaveBeenCalledOnce();
  });

  it("elige BullMQ cuando hay VALKEY_URL y ningún binding", async () => {
    const { resolveTransport } = await loadDispatch();
    process.env.VALKEY_URL = "redis://localhost:6379";

    expect(resolveTransport(ROUTE)).toBe("bullmq");
  });

  it("el binding gana cuando están los dos", async () => {
    const { registerJobBindings, resolveTransport } = await loadDispatch();
    process.env.VALKEY_URL = "redis://localhost:6379";
    registerJobBindings({ NEEDS_QUEUE: fakeProducer() });

    expect(resolveTransport(ROUTE)).toBe("queues");
  });

  it("sin transporte, lanza nombrando las dos opciones", async () => {
    const { resolveTransport, dispatchJob } = await loadDispatch();

    expect(resolveTransport(ROUTE)).toBe("none");
    await expect(dispatchJob(ROUTE, { need: "agua" })).rejects.toThrow(
      /NEEDS_QUEUE[\s\S]*VALKEY_URL/,
    );
  });

  it("el payload viaja sin cambios por el camino de Queues", async () => {
    const { registerJobBindings, dispatchJob } = await loadDispatch();
    const producer = fakeProducer();
    registerJobBindings({ NEEDS_QUEUE: producer });

    const payload = {
      need: { title: "Colchonetas", quantity: 200 },
      location: { lat: 4.84, lng: -76.24 },
    };
    await dispatchJob(ROUTE, payload, { id: "need-xyz" });

    expect(producer.send).toHaveBeenCalledWith(payload);
  });

  it("ignora valores de env que no son productores de cola", async () => {
    const { registerJobBindings, getQueueProducer } = await loadDispatch();
    registerJobBindings({
      NEEDS_QUEUE: "cadena",
      OTRO: 42,
      NULO: null,
      SIN_SEND: { algo: true },
    });

    expect(getQueueProducer("NEEDS_QUEUE")).toBeNull();
    expect(getQueueProducer("SIN_SEND")).toBeNull();
  });

  it("registerJobBindings tolera un env que no es objeto", async () => {
    const { registerJobBindings, resolveTransport } = await loadDispatch();

    expect(() => registerJobBindings(undefined)).not.toThrow();
    expect(() => registerJobBindings("no soy un env")).not.toThrow();
    expect(resolveTransport(ROUTE)).toBe("none");
  });
});
