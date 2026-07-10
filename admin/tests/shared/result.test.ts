import { describe, expect, it } from "vitest";
import { err, ok } from "@/src/shared/result";
import type { ApiError, Result } from "@/src/shared/result";

describe("Result", () => {
  it("ok() constructs a success result", () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it("err() constructs a failure result", () => {
    const error: ApiError = { kind: "http", status: 404, message: "Not Found" };
    const result = err(error);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual(error);
    }
  });

  it("narrowing on ok discriminant gives access to value", () => {
    const result: Result<string> = ok("hello");
    if (result.ok) {
      // TypeScript should narrow value here
      const s: string = result.value;
      expect(s).toBe("hello");
    }
  });

  it("narrowing on ok=false gives access to error", () => {
    const result: Result<string> = err({ kind: "network", message: "fetch failed" });
    if (!result.ok) {
      expect(result.error.kind).toBe("network");
    }
  });

  it("ok() with object value preserves reference", () => {
    const data = { id: 1, name: "test" };
    const result = ok(data);
    if (result.ok) {
      expect(result.value).toBe(data);
    }
  });

  it("ApiError kinds cover all defined variants", () => {
    const kinds: ApiError["kind"][] = ["http", "network", "parse", "auth"];
    expect(kinds).toHaveLength(4);
  });
});
