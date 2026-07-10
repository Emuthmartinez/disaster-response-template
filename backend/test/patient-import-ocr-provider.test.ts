/**
 * Unit — OCR/ICR provider (Minimax VL) for patient imports (#151/#158).
 *
 * Pure unit test: `fetch` is INJECTED, so the suite NEVER touches the network.
 * It pins the safety contract:
 *   - Disabled by default: no API key → no config (the ingest stays 501).
 *   - When configured, the provider calls the parametrized base URL/model/token,
 *     and the token is NEVER returned nor leaked into errors.
 *   - The model answer is parsed into rows that ALWAYS require human review and
 *     never become "valid"/ready (no auto-apply path here).
 *   - Model name is parametrizable.
 *
 * Imports `./helpers` only for its env side-effects (sets NODE_ENV/DATABASE_URL
 * before `@/config/env` loads). No DB or seed is used. 100% synthetic demo data.
 */
import { describe, expect, it, vi } from "vitest";
import "./helpers";
import {
  DEFAULT_OCR_PROMPT,
  getMinimaxOcrConfig,
  isMinimaxOcrEnabled,
  type MinimaxEnvSource,
  type MinimaxOcrConfig,
} from "@/services/ocr/minimax-config";
import {
  extractPatientRowsFromImageUrl,
  MinimaxOcrError,
  OCR_REVIEW_WARNING,
  type FetchLike,
} from "@/services/ocr/minimax-provider";

const FAKE_TOKEN = "demo-minimax-token-DO-NOT-LOG-0123456789";
const IMAGE_URL = "https://example.test/demo-scan.png";

function envSource(overrides: Partial<MinimaxEnvSource> = {}): MinimaxEnvSource {
  return {
    ENABLE_PATIENT_OCR: true,
    MINIMAX_API_KEY: FAKE_TOKEN,
    MINIMAX_OCR_BASE_URL: "https://api.example.org/v1",
    MINIMAX_OCR_MODEL: "generic-vl-model",
    MINIMAX_OCR_MAX_TOKENS: 2048,
    MINIMAX_OCR_TIMEOUT_MS: 30000,
    ...overrides,
  };
}

function configFrom(overrides: Partial<MinimaxEnvSource> = {}): MinimaxOcrConfig {
  const cfg = getMinimaxOcrConfig(envSource(overrides));
  if (!cfg) throw new Error("expected enabled config in test setup");
  return cfg;
}

/** Build a mock fetch returning a chat-completions response with `content`. */
function mockFetch(content: string, init?: { ok?: boolean; status?: number }): FetchLike {
  const ok = init?.ok ?? true;
  const status = init?.status ?? 200;
  return vi.fn(async () => {
    return {
      ok,
      status,
      json: async () => ({ choices: [{ message: { content } }] }),
    } as unknown as Response;
  });
}

describe("getMinimaxOcrConfig — disabled by default", () => {
  it("returns null when no API key is configured (OCR stays disabled → 501)", () => {
    expect(getMinimaxOcrConfig(envSource({ MINIMAX_API_KEY: undefined }))).toBeNull();
    expect(isMinimaxOcrEnabled(envSource({ MINIMAX_API_KEY: undefined }))).toBe(false);
  });

  it("returns null when the API key is blank", () => {
    expect(getMinimaxOcrConfig(envSource({ MINIMAX_API_KEY: "   " }))).toBeNull();
  });

  it("returns null when ENABLE_PATIENT_OCR is off, even with key + URL present", () => {
    expect(getMinimaxOcrConfig(envSource({ ENABLE_PATIENT_OCR: false }))).toBeNull();
    expect(isMinimaxOcrEnabled(envSource({ ENABLE_PATIENT_OCR: false }))).toBe(false);
  });

  it("builds config from env when a token is present (endpoint/model parametrized)", () => {
    const cfg = configFrom({
      MINIMAX_OCR_BASE_URL: "https://custom.example/v1/",
      MINIMAX_OCR_MODEL: "Custom-VL-9",
    });
    expect(cfg.apiKey).toBe(FAKE_TOKEN);
    expect(cfg.baseUrl).toBe("https://custom.example/v1"); // trailing slash trimmed
    expect(cfg.model).toBe("Custom-VL-9");
    expect(cfg.prompt).toBe(DEFAULT_OCR_PROMPT);
  });

  it("uses a custom prompt when provided", () => {
    const cfg = configFrom({ MINIMAX_OCR_PROMPT: "custom extraction prompt" });
    expect(cfg.prompt).toBe("custom extraction prompt");
  });
});

describe("extractPatientRowsFromImageUrl — request shape", () => {
  it("calls the parametrized base URL with the bearer token and the image URL", async () => {
    const fetchMock = mockFetch(JSON.stringify([{ name: "Demo Anon", hospital: "Hospital Demo" }]));
    const cfg = configFrom();
    await extractPatientRowsFromImageUrl(cfg, IMAGE_URL, { fetch: fetchMock });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(calledUrl).toBe("https://api.example.org/v1/chat/completions");

    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${FAKE_TOKEN}`);

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("generic-vl-model");
    expect(body.max_completion_tokens).toBe(2048);
    expect(body.temperature).toBe(0);
    expect(body.thinking).toEqual({ type: "disabled" });
    // Multimodal content carries the image URL.
    const imagePart = body.messages[1].content.find(
      (p: { type: string }) => p.type === "image_url",
    );
    expect(imagePart.image_url.url).toBe(IMAGE_URL);
    expect(imagePart.image_url.detail).toBe("default");
  });

  it("sends the configured (parametrized) model name", async () => {
    const fetchMock = mockFetch(JSON.stringify([]));
    const cfg = configFrom({ MINIMAX_OCR_MODEL: "MiniMax-VL-Future" });
    await extractPatientRowsFromImageUrl(cfg, IMAGE_URL, { fetch: fetchMock });
    const init = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(JSON.parse((init as RequestInit).body as string).model).toBe("MiniMax-VL-Future");
  });

  it("rejects an invalid image URL before any network call", async () => {
    const fetchMock = mockFetch(JSON.stringify([]));
    const cfg = configFrom();
    await expect(extractPatientRowsFromImageUrl(cfg, "not-a-url", { fetch: fetchMock })).rejects.toBeInstanceOf(
      MinimaxOcrError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("extractPatientRowsFromImageUrl — parsing into review-required rows", () => {
  it("parses the model JSON into rows that ALWAYS require human review", async () => {
    const content = JSON.stringify([
      { name: "Demo Anon", hospital: "Hospital Demo", age: "42", condition: "estable" },
      { name: "Otro Demo", hospital: "Hospital Demo" },
    ]);
    const cfg = configFrom();
    const result = await extractPatientRowsFromImageUrl(cfg, IMAGE_URL, { fetch: mockFetch(content) });

    expect(result.needsHumanReview).toBe(true);
    expect(result.warnings).toContain(OCR_REVIEW_WARNING);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ name: "Demo Anon", hospital: "Hospital Demo", age: "42" });
    // No "valid"/"ready"/auto-apply signal exists on the result by construction.
    expect(result).not.toHaveProperty("valid");
    expect(result).not.toHaveProperty("ready");
  });

  it("tolerates code-fenced JSON from the model", async () => {
    const content = "```json\n[{\"name\":\"Demo Anon\",\"hospital\":\"Hospital Demo\"}]\n```";
    const cfg = configFrom();
    const result = await extractPatientRowsFromImageUrl(cfg, IMAGE_URL, { fetch: mockFetch(content) });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.name).toBe("Demo Anon");
  });

  it("keeps only allowlisted fields (untrusted output, no passthrough)", async () => {
    const content = JSON.stringify([
      { name: "Demo Anon", hospital: "Hospital Demo", evilField: "x", __proto__: { polluted: true } },
    ]);
    const cfg = configFrom();
    const result = await extractPatientRowsFromImageUrl(cfg, IMAGE_URL, { fetch: mockFetch(content) });
    expect(result.rows[0]).not.toHaveProperty("evilField");
    expect(result.rows[0]).not.toHaveProperty("polluted");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined(); // prototype intact
  });

  it("drops fully-empty objects so junk lines never become rows", async () => {
    const content = JSON.stringify([{}, { name: "Demo Anon" }, { unknownOnly: "x" }]);
    const cfg = configFrom();
    const result = await extractPatientRowsFromImageUrl(cfg, IMAGE_URL, { fetch: mockFetch(content) });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.name).toBe("Demo Anon");
  });
});

describe("extractPatientRowsFromImageUrl — failures never leak the token", () => {
  it("throws a safe error on non-2xx and does not expose the token", async () => {
    const cfg = configFrom();
    await expect(
      extractPatientRowsFromImageUrl(cfg, IMAGE_URL, { fetch: mockFetch("", { ok: false, status: 401 }) }),
    ).rejects.toThrowError(/status 401/);

    try {
      await extractPatientRowsFromImageUrl(cfg, IMAGE_URL, {
        fetch: mockFetch("", { ok: false, status: 500 }),
      });
    } catch (err) {
      expect((err as Error).message).not.toContain(FAKE_TOKEN);
    }
  });

  it("throws a safe error when the network call itself fails", async () => {
    const cfg = configFrom();
    const failing: FetchLike = vi.fn(async () => {
      throw new Error(`boom with header Bearer ${FAKE_TOKEN}`);
    });
    try {
      await extractPatientRowsFromImageUrl(cfg, IMAGE_URL, { fetch: failing });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(MinimaxOcrError);
      expect((err as Error).message).not.toContain(FAKE_TOKEN);
    }
  });

  it("throws a safe error when the model returns non-array content", async () => {
    const cfg = configFrom();
    await expect(
      extractPatientRowsFromImageUrl(cfg, IMAGE_URL, { fetch: mockFetch('{"not":"an array"}') }),
    ).rejects.toBeInstanceOf(MinimaxOcrError);
  });

  it("the returned result never contains the token", async () => {
    const cfg = configFrom();
    const result = await extractPatientRowsFromImageUrl(cfg, IMAGE_URL, {
      fetch: mockFetch(JSON.stringify([{ name: "Demo Anon" }])),
    });
    expect(JSON.stringify(result)).not.toContain(FAKE_TOKEN);
  });
});
