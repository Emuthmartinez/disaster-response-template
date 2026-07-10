/**
 * Comportamiento del CRUD de roles + protección de roles de sistema.
 *
 * Complementa la matriz de autorización (que solo asierta el gate): aquí se
 * verifica la LÓGICA — lista de capacidades hija, validación contra el catálogo,
 * y que el rol semilla 'admin' (isSystem) no se pueda editar ni borrar por API.
 */
import { beforeAll, describe, expect, it } from "vitest";
import "./helpers";
import request from "supertest";
import { ensureSeed, makeAdmin } from "./helpers";

let app: import("express").Express;
let adminToken: string;

beforeAll(async () => {
  await ensureSeed();
  app = (await import("@/server")).app;
  adminToken = (await makeAdmin()).token;
});

const auth = (r: request.Test) => r.set("Authorization", `Bearer ${adminToken}`);

describe("roles CRUD", () => {
  it("crea un rol con capacidades y las devuelve al leer", async () => {
    const create = await auth(
      request(app).post("/api/public/roles"),
    ).send({ name: `coordinador-${Date.now()}`, capabilities: ["report:read", "missing:read"] });
    expect(create.status).toBe(201);
    const id = create.body.item.id;
    expect(create.body.item.capabilities.sort()).toEqual(["missing:read", "report:read"]);

    const get = await auth(request(app).get(`/api/public/roles/${id}`));
    expect(get.status).toBe(200);
    expect(get.body.item.capabilities).toContain("report:read");
    expect(get.body.item.isSystem).toBe(false);
  });

  it("rechaza una capacidad desconocida con 400", async () => {
    const res = await auth(request(app).post("/api/public/roles")).send({
      name: `bad-${Date.now()}`,
      capabilities: ["nope:read"],
    });
    expect(res.status).toBe(400);
  });

  it("edita las capacidades (reemplazo total)", async () => {
    const create = await auth(request(app).post("/api/public/roles")).send({
      name: `editable-${Date.now()}`,
      capabilities: ["report:read"],
    });
    const id = create.body.item.id;
    const edit = await auth(request(app).patch(`/api/public/roles/${id}`)).send({
      capabilities: ["hospital:read"],
    });
    expect(edit.status).toBe(200);
    expect(edit.body.item.capabilities).toEqual(["hospital:read"]);
  });

  it("borra un rol sin usuarios asignados", async () => {
    const create = await auth(request(app).post("/api/public/roles")).send({
      name: `tmp-${Date.now()}`,
      capabilities: [],
    });
    const del = await auth(request(app).delete(`/api/public/roles/${create.body.item.id}`));
    expect(del.status).toBe(200);
    expect(del.body.ok).toBe(true);
  });
});

describe("protección de roles de sistema", () => {
  async function adminRoleId(): Promise<string> {
    const list = await auth(request(app).get("/api/public/roles"));
    const admin = (list.body.items as Array<{ id: string; isSystem: boolean; name: string }>).find(
      (r) => r.isSystem && r.name === "admin",
    );
    expect(admin, "rol admin de sistema debe existir").toBeTruthy();
    return admin!.id;
  }

  it("no permite editar el rol 'admin' de sistema (403)", async () => {
    const id = await adminRoleId();
    const res = await auth(request(app).patch(`/api/public/roles/${id}`)).send({ capabilities: [] });
    expect(res.status).toBe(403);
  });

  it("no permite borrar el rol 'admin' de sistema (403)", async () => {
    const id = await adminRoleId();
    const res = await auth(request(app).delete(`/api/public/roles/${id}`));
    expect(res.status).toBe(403);
  });
});
