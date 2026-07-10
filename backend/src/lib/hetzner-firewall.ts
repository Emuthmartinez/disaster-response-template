/**
 * Cliente mínimo de la API de Hetzner Cloud para editar el firewall del hub
 * (HUB_FIREWALL_ID) — abrir/cerrar la IP de un consumidor en el puerto 5432.
 *
 * La API de Hetzner reemplaza el set COMPLETO de reglas en cada `set_rules`
 * (no hay "añadir una IP"): hay que leer las reglas actuales, mutar la lista de
 * source_ips de la regla de 5432, y volver a mandar TODAS. Por eso este módulo
 * siempre hace read-modify-write sobre el firewall identificado por HUB_FIREWALL_ID.
 *
 * Si falta config (token o firewall id), `isConfigured()` es false y el service
 * lo trata como "gestión de réplica desactivada" (503), igual que Turnstile en dev.
 */
import { env } from "@/config/env";
import { badGateway, serviceUnavailable } from "@/lib/errors";

const API = "https://api.hetzner.cloud/v1";
const PG_PORT = "5432";

export function isConfigured(): boolean {
  return Boolean(env.HCLOUD_TOKEN && env.HUB_FIREWALL_ID);
}

function assertConfigured(): { token: string; firewallId: number } {
  if (!env.HCLOUD_TOKEN || !env.HUB_FIREWALL_ID) {
    throw serviceUnavailable(
      "Gestión de réplica desactivada: faltan HCLOUD_TOKEN/HUB_FIREWALL_ID.",
    );
  }
  return { token: env.HCLOUD_TOKEN, firewallId: env.HUB_FIREWALL_ID };
}

interface HcloudRule {
  direction: string;
  protocol: string;
  port?: string | null;
  source_ips: string[];
  destination_ips?: string[];
  description?: string | null;
}

async function call(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    throw badGateway(`Hetzner API inalcanzable: ${(err as Error).message}`);
  }
  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const msg =
      (body.error as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`;
    throw badGateway(`Hetzner API error: ${msg}`);
  }
  return body;
}

/** Normaliza a CIDR: una IP sin máscara se trata como /32 (v4) o /128 (v6). */
export function toCidr(ip: string): string {
  if (ip.includes("/")) return ip;
  return ip.includes(":") ? `${ip}/128` : `${ip}/32`;
}

async function getRules(token: string, firewallId: number): Promise<HcloudRule[]> {
  const body = await call(token, `/firewalls/${firewallId}`);
  const fw = body.firewall as { rules?: HcloudRule[] } | undefined;
  return fw?.rules ?? [];
}

/**
 * Reemplaza las source_ips de la regla de entrada de 5432 por `nextSources`,
 * conservando el resto de reglas intactas. Crea la regla 5432 si no existía.
 */
async function setPgSources(nextSources: string[]): Promise<void> {
  const { token, firewallId } = assertConfigured();
  const rules = await getRules(token, firewallId);

  let found = false;
  const next = rules.map((r) => {
    if (r.direction === "in" && r.protocol === "tcp" && r.port === PG_PORT) {
      found = true;
      return { ...r, source_ips: nextSources };
    }
    return r;
  });
  if (!found) {
    next.push({
      direction: "in",
      protocol: "tcp",
      port: PG_PORT,
      source_ips: nextSources,
      description: "hub consumers (managed by backend)",
    });
  }

  await call(token, `/firewalls/${firewallId}/actions/set_rules`, {
    method: "POST",
    body: JSON.stringify({ rules: next }),
  });
}

/** Lee las IPs actualmente permitidas en 5432 (para mostrar/diagnóstico). */
export async function listAllowedIps(): Promise<string[]> {
  const { token, firewallId } = assertConfigured();
  const rules = await getRules(token, firewallId);
  const pg = rules.find(
    (r) => r.direction === "in" && r.protocol === "tcp" && r.port === PG_PORT,
  );
  return pg?.source_ips ?? [];
}

/** Añade una IP/CIDR al allowlist de 5432 (idempotente). */
export async function allowIp(ip: string): Promise<string> {
  const cidr = toCidr(ip);
  const current = await listAllowedIps();
  if (!current.includes(cidr)) await setPgSources([...current, cidr]);
  return cidr;
}

/** Quita una IP/CIDR del allowlist de 5432 (idempotente). */
export async function revokeIp(ip: string): Promise<void> {
  const cidr = toCidr(ip);
  const current = await listAllowedIps();
  if (current.includes(cidr)) await setPgSources(current.filter((c) => c !== cidr));
}
