import { afterEach, describe, expect, it, vi } from "vitest";
import { isR2Configured } from "@/lib/r2";

describe("isR2Configured", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ignora comillas envolventes en vars R2 (env_file legacy)", () => {
    vi.stubEnv("R2_ENDPOINT", "'https://acct.r2.cloudflarestorage.com'");
    vi.stubEnv("R2_STATIC_BUCKET", "'ejemplo-emergencia-media'");
    vi.stubEnv("R2_ACCESS_KEY_ID", "'access-key'");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "'secret-key'");
    vi.stubEnv("R2_PUBLIC_BASE", "'https://cdn.example.com'");
    expect(isR2Configured()).toBe(true);
  });

  it("devuelve false si falta alguna var", () => {
    vi.stubEnv("R2_ENDPOINT", "https://acct.r2.cloudflarestorage.com");
    expect(isR2Configured()).toBe(false);
  });
});

// El mock del SDK aplica a TODO el fichero: isR2Configured no toca el SDK, así
// que sus tests de arriba no se ven afectados. send() cuelga para siempre —
// exactamente el escenario del que protege el timeout de getObject.
vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    send() {
      return new Promise(() => {});
    }
  }
  class GetObjectCommand {
    constructor(public input: unknown) {}
  }
  class PutObjectCommand {
    constructor(public input: unknown) {}
  }
  class DeleteObjectCommand {
    constructor(public input: unknown) {}
  }
  return { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand };
});

describe("getObject", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("degrada a null si R2 no responde dentro del timeout", async () => {
    vi.useFakeTimers();
    vi.stubEnv("R2_ENDPOINT", "https://acct.r2.cloudflarestorage.com");
    vi.stubEnv("R2_STATIC_BUCKET", "ejemplo-emergencia-media");
    vi.stubEnv("R2_ACCESS_KEY_ID", "access-key");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret-key");
    const { getObject } = await import("@/lib/r2");

    const pending = getObject("images/missing/demo.jpg");
    await vi.advanceTimersByTimeAsync(5_100);
    await expect(pending).resolves.toBeNull();
  });
});
