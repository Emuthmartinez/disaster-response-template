/**
 * Vitest global setup file.
 *
 * - Extends expect con los matchers de @testing-library/jest-dom.
 * - Crea un server MSW v2 (sin handlers aquí; cada test los añade con
 *   server.use(...)).
 * - Ciclo de vida: beforeAll → listen (strict), afterEach → reset, afterAll → close.
 *
 * Exporta `server` para que los tests registren handlers:
 *   import { server } from "@/tests/setup";
 *   server.use(http.get("/api/foo", () => HttpResponse.json({ ok: true })));
 */

import "@testing-library/jest-dom";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";

// Sin handlers en el preset — cada test añade los suyos vía server.use(...).
// onUnhandledRequest: "error" garantiza que ninguna request escape a la red real.
export const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
