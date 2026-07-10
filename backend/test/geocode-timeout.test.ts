import { afterEach, describe, expect, it, vi } from "vitest";
import { geocode } from "@/services/geocode";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("geocode", () => {
  it("envía una señal de cancelación a Nominatim", async () => {
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response("[]", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(geocode("Ciudad Ejemplo", null)).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
