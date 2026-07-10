import "./helpers";
import express from "express";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";

const queueMocks = vi.hoisted(() => ({
  enqueue: vi.fn().mockResolvedValue("need-job-1"),
  state: vi.fn().mockResolvedValue({
    jobId: "need-job-1",
    state: "completed",
    progress: 100,
    result: { id: "external-1", status: "pending" },
    failedReason: null,
  }),
}));

vi.mock("@/modules/needs/infrastructure/needs-publication-queue", () => ({
  enqueueNeedPublication: queueMocks.enqueue,
  getNeedPublicationState: queueMocks.state,
}));

process.env.RESPONSEGRID_API_KEY = "test-responsegrid-key";
let app: express.Express;

beforeAll(async () => {
  const { createNeedsRouter } = await import("@/modules/needs/interface/http/needs-router");
  const { errorHandler } = await import("@/middleware");
  app = express();
  app.use(express.json());
  app.use("/api/needs", createNeedsRouter());
  app.use(errorHandler);
});

describe("needs publication HTTP", () => {
  it("encola con idempotencia y responde 202", async () => {
    const response = await request(app)
      .post("/api/needs")
      .set("Idempotency-Key", "request-1")
      .send({
        title: "Agua para centro demo",
        priority: "high",
        address: "Ciudad Ejemplo",
        items: [{ name: "Agua", quantity: 10, category: "water" }],
      });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ queued: true, jobId: "need-job-1" });
    expect(queueMocks.enqueue).toHaveBeenCalledWith(expect.any(Object), "request-1");
  });

  it("expone el estado observable sin cache compartida", async () => {
    const response = await request(app).get("/api/needs/status/need-job-1");
    expect(response.status).toBe(200);
    expect(response.body.state).toBe("completed");
    expect(response.headers["cache-control"]).toBe("no-store");
  });
});
