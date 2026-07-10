/**
 * Ciclo de vida de auth de api/public/auth/*: invitación → aceptación → login →
 * reset por OTP → cambio de contraseña. Verifica el flujo completo de extremo a
 * extremo contra la DB local, incluyendo las garantías de seguridad clave
 * (no-enumeración, OTP de un solo uso, password vieja inválida tras reset).
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

describe("auth flow", () => {
  it("invite → accept → login → reset(OTP) → login-nuevo", async () => {
    const email = `flow-${Date.now()}@test.local`;

    // 1. Admin invita (sin SMTP → devuelve inviteUrl con el token).
    const inv = await request(app)
      .post("/api/public/auth/invite")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email });
    expect(inv.status).toBe(201);
    const token = inv.body.inviteUrl.split("/invite/")[1];
    expect(token).toBeTruthy();

    // 2. Validar invitación (público).
    const check = await request(app).get(`/api/public/auth/invite/${token}`);
    expect(check.status).toBe(200);
    expect(check.body.email).toBe(email);

    // 3. Aceptar: fija password, activa cuenta, entrega JWT.
    const accept = await request(app)
      .post("/api/public/auth/accept")
      .send({ token, password: "firstpass123", name: "Flow User" });
    expect(accept.status).toBe(200);
    expect(accept.body.token).toBeTruthy();

    // 4. Login con esa password.
    const login = await request(app)
      .post("/api/public/auth/login")
      .send({ email, password: "firstpass123" });
    expect(login.status).toBe(200);

    // 5. Reset por OTP. forgot-password siempre 200 (no enumeración).
    const forgot = await request(app).post("/api/public/auth/forgot-password").send({ email });
    expect(forgot.status).toBe(200);

    // Recupera el OTP de la DB (en prod va por email; aquí lo leemos directo).
    const { getDb, schema } = await import("@/db");
    const { eq, desc } = await import("drizzle-orm");
    const { createHash } = await import("crypto");
    // El service guarda solo el hash; para el test generamos y comparamos por
    // fuerza-bruta de 6 dígitos sería lento — en su lugar, el dev-log imprime el
    // OTP, pero aquí lo más robusto es re-derivar: insertamos un OTP conocido.
    // Estrategia: pedir el reset arriba y luego SOBREESCRIBIR el codeHash por uno
    // conocido para validar el endpoint de confirm de forma determinista.
    const known = "123456";
    const users = await getDb()
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    await getDb()
      .update(schema.passwordResets)
      .set({ codeHash: createHash("sha256").update(known).digest("hex") })
      .where(eq(schema.passwordResets.userId, users[0]!.id));

    // 6. Confirmar reset con el OTP conocido.
    const reset = await request(app)
      .post("/api/public/auth/reset-password")
      .send({ email, code: known, newPassword: "secondpass456" });
    expect(reset.status).toBe(200);

    // 7. Password NUEVA funciona, VIEJA no.
    const newLogin = await request(app)
      .post("/api/public/auth/login")
      .send({ email, password: "secondpass456" });
    expect(newLogin.status).toBe(200);
    const oldLogin = await request(app)
      .post("/api/public/auth/login")
      .send({ email, password: "firstpass123" });
    expect(oldLogin.status).toBe(401);

    // 8. OTP de un solo uso: reusarlo falla.
    const reuse = await request(app)
      .post("/api/public/auth/reset-password")
      .send({ email, code: known, newPassword: "third789" });
    expect(reuse.status).toBe(400);
  });

  it("forgot-password con email inexistente también responde 200 (anti-enumeración)", async () => {
    const res = await request(app)
      .post("/api/public/auth/forgot-password")
      .send({ email: "nobody-xyz@nowhere.test" });
    expect(res.status).toBe(200);
  });

  it("login con credenciales malas → 401", async () => {
    const res = await request(app)
      .post("/api/public/auth/login")
      .send({ email: "ghost@test.local", password: "whatever" });
    expect(res.status).toBe(401);
  });

  it("/me sin token → 401", async () => {
    const res = await request(app).get("/api/public/auth/me");
    expect(res.status).toBe(401);
  });

  it("/me con admin → caps ['*']", async () => {
    const res = await request(app).get("/api/public/auth/me").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.isAdmin).toBe(true);
    expect(res.body.capabilities).toContain("*");
  });
});
