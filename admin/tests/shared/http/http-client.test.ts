import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/tests/setup";
import { createHttpClient } from "@/src/shared/http/http-client";

const BASE_URL = "http://test-api.example.com";

describe("HttpClient", () => {
  describe("get — 200 ok", () => {
    it("returns ok result with parsed body", async () => {
      server.use(http.get(`${BASE_URL}/data`, () => HttpResponse.json({ id: 1, name: "test" })));

      const client = createHttpClient({ baseUrl: BASE_URL });
      const result = await client.get<{ id: number; name: string }>("/data");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ id: 1, name: "test" });
      }
    });
  });

  describe("get — 401 auth error", () => {
    it("returns err with kind=auth and status=401", async () => {
      server.use(
        http.get(`${BASE_URL}/protected`, () =>
          HttpResponse.json({ message: "Unauthorized" }, { status: 401 }),
        ),
      );

      const client = createHttpClient({ baseUrl: BASE_URL });
      const result = await client.get("/protected");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("auth");
        expect(result.error.status).toBe(401);
      }
    });
  });

  describe("get — 500 server error", () => {
    it("returns err with kind=http and status=500", async () => {
      server.use(
        http.get(`${BASE_URL}/error`, () =>
          HttpResponse.json({ message: "Internal Server Error" }, { status: 500 }),
        ),
      );

      const client = createHttpClient({ baseUrl: BASE_URL });
      const result = await client.get("/error");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("http");
        expect(result.error.status).toBe(500);
      }
    });
  });

  describe("get — network failure", () => {
    it("returns err with kind=network when fetch rejects", async () => {
      server.use(http.get(`${BASE_URL}/offline`, () => HttpResponse.error()));

      const client = createHttpClient({ baseUrl: BASE_URL });
      const result = await client.get("/offline");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("network");
      }
    });
  });

  describe("get — parse error — invalid JSON in 2xx body", () => {
    it("returns err with kind=parse when body is not valid JSON", async () => {
      server.use(
        http.get(
          `${BASE_URL}/bad-json`,
          () =>
            new HttpResponse("not-json{{{", {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
        ),
      );

      const client = createHttpClient({ baseUrl: BASE_URL });
      const result = await client.get("/bad-json");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("parse");
      }
    });
  });

  describe("get — defaultHeaders", () => {
    it("merges defaultHeaders into every request", async () => {
      let capturedAuth: string | null = null;
      server.use(
        http.get(`${BASE_URL}/secure`, ({ request }) => {
          capturedAuth = request.headers.get("Authorization");
          return HttpResponse.json({ ok: true });
        }),
      );

      const client = createHttpClient({
        baseUrl: BASE_URL,
        defaultHeaders: { Authorization: "Bearer token123" },
      });
      await client.get("/secure");

      expect(capturedAuth).toBe("Bearer token123");
    });
  });

  describe("get — other non-ok status codes", () => {
    it("returns err with kind=http for 403", async () => {
      server.use(
        http.get(`${BASE_URL}/forbidden`, () =>
          HttpResponse.json({ message: "Forbidden" }, { status: 403 }),
        ),
      );

      const client = createHttpClient({ baseUrl: BASE_URL });
      const result = await client.get("/forbidden");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("http");
        expect(result.error.status).toBe(403);
      }
    });
  });

  // ── post ───────────────────────────────────────────────────────────────────

  describe("post — 201 ok — body forwarded", () => {
    it("returns ok result with parsed body and forwards JSON body", async () => {
      let capturedBody: unknown;
      server.use(
        http.post(`${BASE_URL}/items`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({ id: 42, created: true }, { status: 201 });
        }),
      );

      const client = createHttpClient({ baseUrl: BASE_URL });
      const result = await client.post<{ id: number; created: boolean }>("/items", {
        name: "widget",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ id: 42, created: true });
      }
      expect(capturedBody).toEqual({ name: "widget" });
    });

    it("sets Content-Type: application/json on the request", async () => {
      let capturedContentType: string | null = null;
      server.use(
        http.post(`${BASE_URL}/items`, ({ request }) => {
          capturedContentType = request.headers.get("Content-Type");
          return HttpResponse.json({ ok: true }, { status: 200 });
        }),
      );

      const client = createHttpClient({ baseUrl: BASE_URL });
      await client.post("/items", { value: 1 });

      expect(capturedContentType).toContain("application/json");
    });
  });

  describe("post — 401 → auth error", () => {
    it("returns err with kind=auth and status=401", async () => {
      server.use(
        http.post(`${BASE_URL}/protected`, () =>
          HttpResponse.json({ message: "Unauthorized" }, { status: 401 }),
        ),
      );

      const client = createHttpClient({ baseUrl: BASE_URL });
      const result = await client.post("/protected", {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("auth");
        expect(result.error.status).toBe(401);
      }
    });
  });

  describe("post — 500 → http error", () => {
    it("returns err with kind=http and status=500", async () => {
      server.use(
        http.post(`${BASE_URL}/crash`, () =>
          HttpResponse.json({ message: "Server exploded" }, { status: 500 }),
        ),
      );

      const client = createHttpClient({ baseUrl: BASE_URL });
      const result = await client.post("/crash", {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("http");
        expect(result.error.status).toBe(500);
      }
    });
  });

  describe("post — network failure → network error", () => {
    it("returns err with kind=network when fetch rejects", async () => {
      server.use(http.post(`${BASE_URL}/offline`, () => HttpResponse.error()));

      const client = createHttpClient({ baseUrl: BASE_URL });
      const result = await client.post("/offline", { data: "x" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("network");
      }
    });
  });

  describe("post — parse error — invalid JSON in 2xx body", () => {
    it("returns err with kind=parse when body is not valid JSON", async () => {
      server.use(
        http.post(
          `${BASE_URL}/bad-json`,
          () =>
            new HttpResponse("not-json{{{", {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
        ),
      );

      const client = createHttpClient({ baseUrl: BASE_URL });
      const result = await client.post("/bad-json", {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("parse");
      }
    });
  });
});
