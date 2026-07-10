/**
 * Rutas de autenticación de la superficie `api/public/*`.
 *
 *   POST   /api/public/auth/invite          (user:invite)  crea invitación + email
 *   GET    /api/public/auth/invite/:token   (público)      valida invitación
 *   POST   /api/public/auth/accept          (público)      acepta: fija password → JWT
 *   POST   /api/public/auth/login           (público+RL)   email+password → JWT
 *   POST   /api/public/auth/logout          (público)      limpia la cookie
 *   GET    /api/public/auth/me              (requireAuth)  usuario + capacidades
 *
 * El JWT se entrega de DOS formas, para web e integraciones:
 *   - cookie httpOnly (navegador, credentials:include), y
 *   - en el body de la respuesta (`token`) para clientes tipo Postman/API.
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler, rateLimit, validate } from "@/middleware";
import { requireAuth, requireCapability } from "@/middleware/auth";
import { badRequest, notFound, unauthorized } from "@/lib/errors";
import { signToken, sessionCookieOptions } from "@/auth/jwt";
import { env } from "@/config/env";
import { writeAudit } from "@/auth/audit";
import { sendInvitationEmail, inviteUrl, sendPasswordResetEmail } from "@/auth/mailer";
import { effectiveCapabilities } from "@/auth/resolve";
import * as service from "@/services/auth";

export const authRouter = Router();

const inviteBody = z.object({
  email: z.string().trim().email("Email inválido.").max(200),
  roleId: z.string().min(1).nullable().optional(),
});
const tokenParams = z.object({ token: z.string().min(10, "Token inválido.") });
const acceptBody = z.object({
  token: z.string().min(10, "Token inválido."),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(200),
  name: z.string().trim().max(120).optional(),
});
const loginBody = z.object({
  email: z.string().trim().email("Email inválido.").max(200),
  password: z.string().min(1, "Indica tu contraseña.").max(200),
});
const forgotBody = z.object({
  email: z.string().trim().email("Email inválido.").max(200),
});
const resetBody = z.object({
  email: z.string().trim().email("Email inválido.").max(200),
  code: z.string().trim().regex(/^\d{6}$/, "El código son 6 dígitos."),
  newPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(200),
});
const changePwBody = z.object({
  currentPassword: z.string().min(1, "Indica tu contraseña actual.").max(200),
  newPassword: z.string().min(8, "La nueva contraseña debe tener al menos 8 caracteres.").max(200),
});

/**
 * @swagger
 * /api/public/auth/invite:
 *   post:
 *     summary: Invitar a un usuario (capability user:invite)
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Invitación creada (email enviado o link devuelto en dev) }
 *       403: { description: Sin capacidad user:invite }
 */
authRouter.post(
  "/invite",
  rateLimit({ scope: "auth:invite", limit: 30 }),
  requireCapability("user:invite"),
  validate({ body: inviteBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof inviteBody>;
    let invite;
    try {
      invite = await service.createInvitation({
        email: body.email,
        roleId: body.roleId ?? null,
        invitedBy: req.user!.id,
      });
    } catch (e) {
      if (e instanceof Error && e.message === "ROLE_NOT_FOUND") throw badRequest("El rol indicado no existe.");
      if (e instanceof service.ActiveAccountInvitationError) {
        throw badRequest("La cuenta ya está activa; no se puede volver a invitar.");
      }
      throw e;
    }
    const { sent } = await sendInvitationEmail(body.email, invite.token);
    await writeAudit(req, {
      action: "auth.invite",
      targetType: "user",
      targetId: body.email,
      metadata: { roleId: body.roleId ?? null, emailSent: sent },
    });
    // Si no se mandó email (sin SMTP, dev) devolvemos el link para uso manual.
    res.status(201).json({
      ok: true,
      emailSent: sent,
      ...(sent ? {} : { inviteUrl: inviteUrl(invite.token) }),
      expiresAt: invite.expiresAt,
    });
  }),
);

/**
 * @swagger
 * /api/public/auth/invite/{token}:
 *   get:
 *     summary: Validar una invitación (público)
 *     tags: [Auth]
 *     responses:
 *       200: { description: Invitación válida }
 *       404: { description: No existe / expiró / ya usada }
 */
authRouter.get(
  "/invite/:token",
  rateLimit({ scope: "auth:invite-check", limit: 60 }),
  validate({ params: tokenParams }),
  asyncHandler(async (req, res) => {
    const { token } = req.params as z.infer<typeof tokenParams>;
    const inv = await service.getValidInvitation(token);
    if (!inv) throw notFound("Invitación no válida o expirada.");
    res.json({ email: inv.email, roleId: inv.roleId, expiresAt: inv.expiresAt });
  }),
);

/**
 * @swagger
 * /api/public/auth/accept:
 *   post:
 *     summary: Aceptar invitación (fija contraseña, activa cuenta) → JWT
 *     tags: [Auth]
 *     responses:
 *       200: { description: Cuenta activada; cookie de sesión + token en el body }
 *       400: { description: Token inválido/expirado }
 */
authRouter.post(
  "/accept",
  rateLimit({ scope: "auth:accept", limit: 20 }),
  validate({ body: acceptBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof acceptBody>;
    let result;
    try {
      result = await service.acceptInvitation(body.token, body.password, body.name);
    } catch (error) {
      if (error instanceof service.ActiveAccountInvitationError) {
        throw badRequest("La cuenta ya está activa; la invitación no puede reemplazarla.");
      }
      throw error;
    }
    if (!result) throw badRequest("Invitación no válida o expirada.");
    const token = signToken(result.userId);
    res.cookie(env.AUTH_COOKIE_NAME, token, sessionCookieOptions());
    await writeAudit(req, { action: "auth.accept", targetType: "user", targetId: result.userId });
    res.json({ ok: true, token });
  }),
);

/**
 * @swagger
 * /api/public/auth/login:
 *   post:
 *     summary: Login email+password → JWT (cookie + body)
 *     tags: [Auth]
 *     responses:
 *       200: { description: Autenticado }
 *       401: { description: Credenciales inválidas }
 */
authRouter.post(
  "/login",
  rateLimit({ scope: "auth:login", limit: 10 }),
  validate({ body: loginBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof loginBody>;
    const result = await service.login(body.email, body.password);
    if (!result) throw unauthorized("Email o contraseña incorrectos.");
    const token = signToken(result.userId);
    res.cookie(env.AUTH_COOKIE_NAME, token, sessionCookieOptions());
    await writeAudit(req, { action: "auth.login", targetType: "user", targetId: result.userId });
    res.json({ ok: true, token });
  }),
);

/**
 * @swagger
 * /api/public/auth/forgot-password:
 *   post:
 *     summary: Solicitar OTP de recuperación (rate-limit estricto)
 *     tags: [Auth]
 *     responses:
 *       200: { description: Si el email existe, se envió un código (respuesta uniforme) }
 */
authRouter.post(
  "/forgot-password",
  // Rate-limit estricto: por IP. (El servicio además limita 1 OTP activo/usuario.)
  rateLimit({ scope: "auth:forgot", limit: 5, windowMs: 15 * 60_000 }),
  validate({ body: forgotBody }),
  asyncHandler(async (req, res) => {
    const { email } = req.body as z.infer<typeof forgotBody>;
    const result = await service.requestPasswordReset(email);
    if (result) {
      await sendPasswordResetEmail(email, result.code);
      await writeAudit(req, { action: "auth.forgot_password", targetType: "user", targetId: result.userId });
    }
    // SIEMPRE 200 (no filtra si el email existe — anti enumeración).
    res.json({ ok: true, message: "Si el email existe, recibirás un código." });
  }),
);

/**
 * @swagger
 * /api/public/auth/reset-password:
 *   post:
 *     summary: Restablecer contraseña con el OTP (rate-limit estricto)
 *     tags: [Auth]
 *     responses:
 *       200: { description: Contraseña restablecida }
 *       400: { description: Código inválido/expirado }
 */
authRouter.post(
  "/reset-password",
  rateLimit({ scope: "auth:reset", limit: 10, windowMs: 15 * 60_000 }),
  validate({ body: resetBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof resetBody>;
    const result = await service.confirmPasswordReset(body.email, body.code, body.newPassword);
    if (!result) throw badRequest("Código inválido o expirado.");
    await writeAudit(req, { action: "auth.reset_password", targetType: "user", targetId: result.userId });
    res.json({ ok: true });
  }),
);

/**
 * @swagger
 * /api/public/auth/change-password:
 *   post:
 *     summary: Cambiar contraseña (autenticado; requiere la actual)
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Contraseña cambiada }
 *       400: { description: Contraseña actual incorrecta }
 */
authRouter.post(
  "/change-password",
  rateLimit({ scope: "auth:change-pw", limit: 10 }),
  requireAuth,
  validate({ body: changePwBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof changePwBody>;
    const ok = await service.changePassword(req.user!.id, body.currentPassword, body.newPassword);
    if (!ok) throw badRequest("La contraseña actual es incorrecta.");
    await writeAudit(req, { action: "auth.change_password", targetType: "user", targetId: req.user!.id });
    res.json({ ok: true });
  }),
);

/**
 * @swagger
 * /api/public/auth/logout:
 *   post:
 *     summary: Cerrar sesión (limpia la cookie)
 *     tags: [Auth]
 *     responses:
 *       200: { description: Sesión cerrada }
 */
authRouter.post(
  "/logout",
  rateLimit({ scope: "auth:logout", limit: 60 }),
  asyncHandler(async (_req, res) => {
    res.clearCookie(env.AUTH_COOKIE_NAME, { ...sessionCookieOptions(), maxAge: undefined });
    res.json({ ok: true });
  }),
);

/**
 * @swagger
 * /api/public/auth/me:
 *   get:
 *     summary: Usuario autenticado + sus capacidades efectivas
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Perfil + capacidades }
 *       401: { description: No autenticado }
 */
authRouter.get(
  "/me",
  rateLimit({ scope: "auth:me", limit: 120 }),
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const capabilities = await effectiveCapabilities(user);
    // Defensa en profundidad: respuesta POR-USUARIO (email, rol, capacidades).
    // NUNCA debe cachearse en un proxy/CDN compartido. No-store hace que ningún
    // intermediario la guarde, independiente de la config de Cloudflare.
    res.set("Cache-Control", "no-store");
    res.json({
      user: {
        id: user.id,
        email: user.email,
        roleId: user.roleId,
        orgId: user.orgId,
        isAdmin: user.isSystemAdmin,
      },
      capabilities,
    });
  }),
);
