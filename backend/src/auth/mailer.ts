/**
 * Envío de emails de invitación por SMTP (motor estándar de invitaciones). OPCIONAL: sin
 * SMTP_HOST configurado, `sendInvitationEmail` devuelve {sent:false} y el caller
 * expone el link en la respuesta (flujo dev). En prod con SMTP, manda el correo.
 */
import nodemailer from "nodemailer";
import { env } from "@/config/env";

let _transport: nodemailer.Transporter | null = null;

function transport(): nodemailer.Transporter | null {
  if (!env.SMTP_HOST) return null;
  if (_transport) return _transport;
  _transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465, // 465 = TLS implícito; 587 = STARTTLS
    auth: env.SMTP_USERNAME ? { user: env.SMTP_USERNAME, pass: env.SMTP_PASSWORD } : undefined,
  });
  return _transport;
}

/** Construye el link de aceptación de invitación (frontend). */
export function inviteUrl(token: string): string {
  const base = env.APP_BASE_URL.replace(/\/$/, "");
  return `${base}/invite/${token}`;
}

/**
 * Manda el email de invitación. Devuelve {sent} para que el caller decida si
 * exponer el link en la respuesta (cuando no hay SMTP, p.ej. dev).
 */
export async function sendInvitationEmail(to: string, token: string): Promise<{ sent: boolean }> {
  const t = transport();
  const url = inviteUrl(token);
  if (!t) return { sent: false };

  await t.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: "Te invitaron a Mapa Emergencia",
    text: `Has sido invitado a Mapa Emergencia.\n\nActiva tu cuenta aquí (expira pronto):\n${url}\n\nSi no esperabas esto, ignora este correo.`,
    html: `<p>Has sido invitado a <strong>Mapa Emergencia</strong>.</p>
<p><a href="${url}">Activa tu cuenta aquí</a> (el enlace expira pronto).</p>
<p style="color:#666;font-size:12px">Si no esperabas esto, ignora este correo.</p>`,
  });
  return { sent: true };
}

/**
 * Manda el código OTP de recuperación de contraseña. {sent:false} si no hay SMTP
 * (dev) — el caller NO debe exponer el código en la respuesta (a diferencia del
 * invite link): un OTP en la respuesta anularía la prueba de posesión del email.
 */
export async function sendPasswordResetEmail(to: string, code: string): Promise<{ sent: boolean }> {
  const t = transport();
  if (!t) {
    // Dev sin SMTP: lo logueamos a stderr para poder probar el flujo localmente.
    console.log(`[mailer] (dev, sin SMTP) OTP de reset para ${to}: ${code}`);
    return { sent: false };
  }
  await t.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: "Código para restablecer tu contraseña",
    text: `Tu código para restablecer la contraseña es: ${code}\n\nCaduca en 15 minutos. Si no lo pediste, ignora este correo.`,
    html: `<p>Tu código para restablecer la contraseña es:</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:3px">${code}</p>
<p style="color:#666;font-size:12px">Caduca en 15 minutos. Si no lo pediste, ignora este correo.</p>`,
  });
  return { sent: true };
}
