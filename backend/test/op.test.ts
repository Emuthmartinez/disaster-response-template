import "./helpers";
import express from "express";
import request from "supertest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let app: express.Express;

beforeAll(async () => {
  const { opRouter } = await import("@/routes/op");
  const { errorHandler } = await import("@/middleware");
  app = express();
  app.use("/api/op", opRouter);
  app.use(errorHandler);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenPanel script proxy", () => {
  it("propaga el fallo upstream sin cachearlo como JavaScript exitoso", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("upstream failed", { status: 503 })),
    );

    const response = await request(app).get("/api/op/op1.js");

    expect(response.status).toBe(502);
    expect(response.type).toBe("application/json");
    expect(response.headers["cache-control"]).toBeUndefined();
  });
});
