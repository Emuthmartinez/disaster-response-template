import { describe, expect, it } from "vitest";
import { createHttpModelsGateway } from "@/src/contexts/models/infrastructure/http-models-gateway";
import { ok, err } from "@/src/shared/result";
import type { Result, ApiError } from "@/src/shared/result";
import type { HttpClient } from "@/src/shared/http/http-client";

// Responder no genérico para los tests; se castea a la firma genérica de get.
type GetResponder = (path: string) => Promise<Result<unknown>>;

function fakeClient(get: GetResponder): HttpClient {
  const unused = async () =>
    err<ApiError>({ kind: "http", status: 500, message: "n/a" });
  return {
    get: get as HttpClient["get"],
    post: unused as HttpClient["post"],
    patch: unused as HttpClient["patch"],
    delete: unused as HttpClient["delete"],
  };
}

describe("http-models-gateway", () => {
  it("extrae el array items del envelope {items}", async () => {
    const client = fakeClient(async () =>
      ok({ items: [{ id: "1", name: "a" }, { id: "2", name: "b" }] }),
    );
    const result = await createHttpModelsGateway(client).list("reports");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(2);
  });

  it("propaga el error del cliente (auth)", async () => {
    const client = fakeClient(async () => err({ kind: "auth", status: 401, message: "no" }));
    const result = await createHttpModelsGateway(client).list("reports");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("auth");
  });

  it("devuelve parse error si items no es array", async () => {
    const client = fakeClient(async () => ok({ items: "nope" } as unknown as { items: unknown[] }));
    const result = await createHttpModelsGateway(client).list("reports");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("parse");
  });

  it("descarta items que no son objetos planos", async () => {
    const client = fakeClient(async () => ok({ items: [{ id: "1" }, null, 5, "x"] }));
    const result = await createHttpModelsGateway(client).list("reports");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([{ id: "1" }]);
  });

  it("pide la ruta /api/public/<path>", async () => {
    let calledPath = "";
    const client = fakeClient(async (p) => {
      calledPath = p;
      return ok({ items: [] });
    });
    await createHttpModelsGateway(client).list("hospitals");
    expect(calledPath).toBe("/api/public/hospitals");
  });
});
