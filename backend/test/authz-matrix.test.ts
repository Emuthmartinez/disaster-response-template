/**
 * Matriz de autorización — la red de seguridad de la superficie api/public/*.
 *
 *   Cada caso = (endpoint, método, capacidad-requerida) × varios SUJETOS
 *   (anónimo, usuario sin caps, usuario con la cap exacta, admin) × veredicto
 *   esperado ALLOW|DENY.
 *
 * Se asierta AUTORIZACIÓN, no validez de negocio: un 200/201/400/404 = "la
 * puerta me dejó pasar" (ALLOW); solo 401/403 = "bloqueado" (DENY). Así un
 * cambio que rompa el gate en CUALQUIER dirección (alguien sin permiso entra, o
 * alguien con permiso queda fuera) falla el test.
 *
 * Requiere el stack local arriba. Importa la app DESPUÉS de fijar el env.
 */
import { beforeAll, describe, expect, it } from "vitest";
import "./helpers"; // fija process.env antes de cargar la app
import request from "supertest";
import { ensureSeed, makeAdmin, makeUserWithCaps } from "./helpers";

// app se importa de forma perezosa tras el env.
let app: import("express").Express;
let adminToken: string;

/** Un veredicto no-bloqueado: cualquier status salvo 401/403. */
const passedGate = (status: number) => status !== 401 && status !== 403;

beforeAll(async () => {
  await ensureSeed();
  app = (await import("@/server")).app;
  adminToken = (await makeAdmin()).token;
});

// (endpoint, método, capacidad que protege, body de ejemplo para escrituras)
interface Case {
  label: string;
  method: "get" | "post" | "patch" | "delete";
  path: string;
  cap: string;
  body?: object;
}

const CASES: Case[] = [
  { label: "reports list", method: "get", path: "/api/public/reports", cap: "report:read" },
  {
    label: "reports create",
    method: "post",
    path: "/api/public/reports",
    cap: "report:create",
    body: { type: "critical", lat: 10.5, lng: -66.9, place: "Test", affected: 1, needs: "agua" },
  },
  { label: "reports delete", method: "delete", path: "/api/public/reports/none", cap: "report:delete" },
  { label: "missing list", method: "get", path: "/api/public/missing", cap: "missing:read" },
  { label: "hospitals list", method: "get", path: "/api/public/hospitals", cap: "hospital:read" },
  { label: "patients list", method: "get", path: "/api/public/patients", cap: "patient:read" },
  { label: "donations list", method: "get", path: "/api/public/donations", cap: "donation:read" },
  { label: "chat list", method: "get", path: "/api/public/chat", cap: "chat:read" },
  { label: "contact list", method: "get", path: "/api/public/contact", cap: "contact:read" },
  { label: "invite (user:invite)", method: "post", path: "/api/public/auth/invite", cap: "user:invite", body: { email: "x@y.z" } },
  {
    label: "patient-import create",
    method: "post",
    path: "/api/public/patient-imports",
    cap: "patient:import",
    body: { rows: [{ name: "Demo Anon", hospital: "Hospital Demo" }] },
  },
  { label: "patient-import detail", method: "get", path: "/api/public/patient-imports/none", cap: "patient:import" },
  { label: "patient-import rows", method: "get", path: "/api/public/patient-imports/none/rows", cap: "patient:import" },
  { label: "patient-import apply", method: "post", path: "/api/public/patient-imports/none/apply", cap: "patient:import" },
  // --- RBAC admin (roles vía fábrica; users/grants/audit a mano) ---
  { label: "roles list", method: "get", path: "/api/public/roles", cap: "role:read" },
  {
    label: "roles create",
    method: "post",
    path: "/api/public/roles",
    cap: "role:create",
    body: { name: "Test Role", capabilities: ["report:read"] },
  },
  { label: "roles edit", method: "patch", path: "/api/public/roles/none", cap: "role:edit", body: { name: "x" } },
  { label: "roles delete", method: "delete", path: "/api/public/roles/none", cap: "role:delete" },
  { label: "users list", method: "get", path: "/api/public/users", cap: "user:read" },
  { label: "users edit", method: "patch", path: "/api/public/users/none", cap: "user:edit", body: { status: "active" } },
  { label: "users delete", method: "delete", path: "/api/public/users/none", cap: "user:delete" },
  { label: "grants list", method: "get", path: "/api/public/grants", cap: "grant:read" },
  {
    label: "grants create",
    method: "post",
    path: "/api/public/grants",
    cap: "grant:manage",
    body: { userId: "none", capabilityKey: "report:read" },
  },
  { label: "grants revoke", method: "delete", path: "/api/public/grants/none", cap: "grant:manage" },
  { label: "audit list", method: "get", path: "/api/public/audit", cap: "audit:read" },
  { label: "capabilities catalog", method: "get", path: "/api/public/capabilities", cap: "role:read" },
];

function send(method: Case["method"], path: string, token?: string, body?: object) {
  let r = request(app)[method](path);
  if (token) r = r.set("Authorization", `Bearer ${token}`);
  if (body) r = r.send(body);
  return r;
}

describe("authz matrix — api/public/*", () => {
  for (const c of CASES) {
    describe(c.label, () => {
      it("anónimo → DENY (401)", async () => {
        const res = await send(c.method, c.path, undefined, c.body);
        expect(res.status).toBe(401);
      });

      it("usuario SIN la capacidad → DENY (403)", async () => {
        const { token } = await makeUserWithCaps([]); // rol sin permisos
        const res = await send(c.method, c.path, token, c.body);
        expect(res.status).toBe(403);
      });

      it("usuario CON la capacidad exacta → ALLOW (no 401/403)", async () => {
        const { token } = await makeUserWithCaps([c.cap]);
        const res = await send(c.method, c.path, token, c.body);
        expect(passedGate(res.status)).toBe(true);
      });

      it("admin → ALLOW (no 401/403)", async () => {
        const res = await send(c.method, c.path, adminToken, c.body);
        expect(passedGate(res.status)).toBe(true);
      });
    });
  }

  it("una capacidad NO desbloquea otra (report:read no abre report:create)", async () => {
    const { token } = await makeUserWithCaps(["report:read"]);
    const res = await send("post", "/api/public/reports", token, {
      type: "critical",
      lat: 10,
      lng: -66,
      place: "x",
      affected: 0,
    });
    expect(res.status).toBe(403);
  });

  it("token basura → DENY (401)", async () => {
    const res = await send("get", "/api/public/reports", "garbage.token.here");
    expect(res.status).toBe(401);
  });
});
