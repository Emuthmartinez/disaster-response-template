import { afterEach, describe, expect, it, vi } from "vitest";
import { isR2Configured } from "@/lib/r2";

describe("isR2Configured", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ignora comillas envolventes en vars R2 (env_file legacy)", () => {
    vi.stubEnv("R2_ENDPOINT", "'https://acct.r2.cloudflarestorage.com'");
    vi.stubEnv("R2_STATIC_BUCKET", "'terremoto-media'");
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
