/**
 * Bitácora de auditoría — registra TODA mutación sensible (auth + escrituras de
 * api/public/*). Fire-and-forget: un fallo al auditar NUNCA debe tumbar la
 * operación que ya se hizo, pero sí se loguea a stderr.
 *
 * Uso desde un handler (req disponible para actor + IP hasheada):
 *   await writeAudit(req, { action: "report.delete", targetType: "report", targetId: id });
 */
import type { Request } from "express";
import { getDb, schema } from "@/db";
import { hashIp } from "@/lib/client-ip";

export interface AuditEntry {
  action: string; // "role.create", "report.delete", "auth.login", ...
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

/** Inserta una entrada de auditoría. No lanza (errores van a stderr). */
export async function writeAudit(req: Request, entry: AuditEntry): Promise<void> {
  try {
    let ipHash: string | null = null;
    try {
      ipHash = hashIp(req);
    } catch {
      ipHash = null; // sin IP_SALT no hasheamos; no es motivo para perder el evento
    }
    await getDb()
      .insert(schema.auditLog)
      .values({
        actorUserId: req.user?.id ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: entry.metadata ?? null,
        ipHash,
        createdAt: Date.now(),
      });
  } catch (err) {
    console.error("audit write failed:", entry.action, err);
  }
}
