import "./helpers";
import express from "express";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/services/donations", () => ({
  MIN_DONATION_CENTS: 100,
  MAX_DONATION_CENTS: 1_000_000,
  MONTHLY_DONATION_GOAL_CENTS: 1_000_000,
  PAYPAL_DONATION_URL: "https://example.test/pay",
  getDonationStats: vi.fn().mockRejectedValue(new Error("db unavailable")),
  getMonthlyDonationStats: vi.fn().mockRejectedValue(new Error("db unavailable")),
  listRecentDonations: vi.fn().mockRejectedValue(new Error("db unavailable")),
  recordDonation: vi.fn(),
}));

vi.mock("@/services/psychology-help", () => ({
  getPsychologyHelpClickCount: vi.fn().mockRejectedValue(new Error("db unavailable")),
  incrementPsychologyHelpClick: vi.fn(),
}));

let app: express.Express;

beforeAll(async () => {
  const { donationsRouter } = await import("@/routes/donations");
  const { psychologyHelpRouter } = await import("@/routes/psychology-help");
  const { errorHandler } = await import("@/middleware");
  app = express();
  app.use("/api/donations", donationsRouter);
  app.use("/api/stats/psychology-help", psychologyHelpRouter);
  app.use(errorHandler);
});

describe("metric reads when the database fails", () => {
  it.each([
    "/api/donations",
    "/api/stats/psychology-help",
  ])("returns a non-cacheable failure from %s", async (path) => {
    const response = await request(app).get(path);
    expect(response.status).toBe(503);
    expect(response.headers["cache-control"]).toBeUndefined();
  });
});
