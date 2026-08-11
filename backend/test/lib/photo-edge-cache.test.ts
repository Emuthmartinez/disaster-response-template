import { describe, expect, it } from "vitest";
import {
  isCacheablePhotoPath,
  servePhotoCached,
  type EdgeCache,
} from "@/lib/photo-edge-cache";

function fakeCache(initial?: Response): {
  cache: EdgeCache;
  puts: Array<{ url: string; response: Response }>;
} {
  const puts: Array<{ url: string; response: Response }> = [];
  let stored = initial;
  return {
    puts,
    cache: {
      async match() {
        return stored;
      },
      async put(key, response) {
        stored = response;
        puts.push({ url: key.url, response });
      },
    },
  };
}

describe("isCacheablePhotoPath", () => {
  it("acepta los cinco endpoints de foto", () => {
    expect(isCacheablePhotoPath("/api/missing/abc-123/photo")).toBe(true);
    expect(isCacheablePhotoPath("/api/missing/abc-123/resolution-photo")).toBe(true);
    expect(isCacheablePhotoPath("/api/pets/abc-123/photo")).toBe(true);
    expect(isCacheablePhotoPath("/api/pets/abc-123/resolution-photo")).toBe(true);
    expect(isCacheablePhotoPath("/api/reports/abc-123/photo")).toBe(true);
  });

  it("rechaza el resto de la superficie", () => {
    expect(isCacheablePhotoPath("/api/missing")).toBe(false);
    expect(isCacheablePhotoPath("/api/missing/abc/photo/extra")).toBe(false);
    expect(isCacheablePhotoPath("/api/reports/abc/resolution-photo")).toBe(false);
    expect(isCacheablePhotoPath("/api/missing/stats")).toBe(false);
    expect(isCacheablePhotoPath("/photo")).toBe(false);
  });
});

describe("servePhotoCached", () => {
  const URL_ = "https://api.example.org/api/missing/x/photo";

  it("miss: va al origen, cachea el 200 y marca miss", async () => {
    const { cache, puts } = fakeCache();
    const pending: Promise<unknown>[] = [];
    const res = await servePhotoCached({
      url: URL_,
      cache,
      fetchOrigin: async () =>
        new Response("bytes", { status: 200, headers: { "Content-Type": "image/png" } }),
      waitUntil: (p) => pending.push(p),
    });
    await Promise.all(pending);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-photo-edge-cache")).toBe("miss");
    expect(puts).toHaveLength(1);
  });

  it("hit: sirve del cache sin tocar el origen y marca hit", async () => {
    const { cache } = fakeCache(
      new Response("cached-bytes", { status: 200, headers: { "Content-Type": "image/png" } }),
    );
    let originCalls = 0;
    const res = await servePhotoCached({
      url: URL_,
      cache,
      fetchOrigin: async () => {
        originCalls += 1;
        return new Response("fresh", { status: 200 });
      },
      waitUntil: () => {},
    });
    expect(originCalls).toBe(0);
    expect(res.headers.get("x-photo-edge-cache")).toBe("hit");
    expect(await res.text()).toBe("cached-bytes");
  });

  it("no cachea errores: un 404/500 pasa de largo sin put", async () => {
    for (const status of [404, 500]) {
      const { cache, puts } = fakeCache();
      const res = await servePhotoCached({
        url: URL_,
        cache,
        fetchOrigin: async () => new Response("nope", { status }),
        waitUntil: () => {},
      });
      expect(res.status).toBe(status);
      expect(puts).toHaveLength(0);
    }
  });

  it("no cachea redirects 302 (foto externa/R2 delegada al CDN)", async () => {
    const { cache, puts } = fakeCache();
    const res = await servePhotoCached({
      url: URL_,
      cache,
      fetchOrigin: async () =>
        new Response(null, { status: 302, headers: { Location: "https://cdn.example.org/x.jpg" } }),
      waitUntil: () => {},
    });
    expect(res.status).toBe(302);
    expect(puts).toHaveLength(0);
  });
});
