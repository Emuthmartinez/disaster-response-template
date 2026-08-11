import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

// public/sw.js es un script plano (sin build) que corre en un Service Worker,
// no un módulo importable por vitest. Lo cargamos con `vm` en un sandbox
// mínimo que imita los globals de SW (self/caches/fetch) y leemos de vuelta
// la función `isApiRequest` que queda declarada en el ámbito superior del
// script (en modo no-estricto, una `function` de nivel superior cuelga del
// objeto global del sandbox). Así probamos el fichero real que se sirve, no
// una copia reescrita a mano que podría divergir.
//
// isApiRequest() mira `self.location.origin` para decidir "same-origin", así
// que fijamos ese origin al host web de ejemplo de la plantilla.

type SwSandbox = {
  self: Record<string, unknown> & { location: { origin: string } };
  caches: { open: (name: string) => Promise<unknown> };
  fetch: typeof fetch;
  Response: typeof Response;
  Request: typeof Request;
  URL: typeof URL;
  AbortController: typeof AbortController;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  isApiRequest?: (url: URL) => boolean;
};

function loadServiceWorkerSandbox(): SwSandbox {
  const source = readFileSync(
    path.join(__dirname, "../../public/sw.js"),
    "utf8",
  );
  const sandbox = {
    caches: {
      open: async () => ({
        addAll: async () => {},
        match: async () => undefined,
        put: async () => {},
      }),
    },
    fetch: (async () => new Response("", { status: 200 })) as typeof fetch,
    Response,
    Request,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
  } as unknown as SwSandbox;
  sandbox.self = sandbox as unknown as SwSandbox["self"];
  sandbox.self.addEventListener = () => {};
  sandbox.self.location = { origin: "https://mapa.example.org" };
  vm.createContext(sandbox);
  new vm.Script(source, { filename: "sw.js" }).runInContext(sandbox);
  return sandbox;
}

describe("sw.js isApiRequest", () => {
  let isApiRequest: (url: URL) => boolean;

  beforeAll(() => {
    const sandbox = loadServiceWorkerSandbox();
    if (typeof sandbox.isApiRequest !== "function") {
      throw new Error(
        "public/sw.js no expone isApiRequest en el ámbito superior del script",
      );
    }
    isApiRequest = sandbox.isApiRequest;
  });

  it("acepta rutas /api/ same-origin", () => {
    expect(isApiRequest(new URL("https://mapa.example.org/api/missing"))).toBe(
      true,
    );
  });

  it("acepta el host de API de producción", () => {
    expect(
      isApiRequest(new URL("https://api.mapa.example.org/api/missing")),
    ).toBe(true);
  });

  it("acepta el host de API de staging (hermano, no hijo, de api.)", () => {
    expect(
      isApiRequest(
        new URL("https://api-staging.mapa.example.org/api/missing"),
      ),
    ).toBe(true);
  });

  it("rechaza hosts cross-origin que solo contienen 'api'", () => {
    expect(
      isApiRequest(new URL("https://notapi.example.org/api/missing")),
    ).toBe(false);
    expect(
      isApiRequest(new URL("https://apix.example.org/api/missing")),
    ).toBe(false);
  });

  it("rechaza rutas que no son /api/ incluso en el host de API", () => {
    expect(
      isApiRequest(new URL("https://api.mapa.example.org/hospitales")),
    ).toBe(false);
  });
});
