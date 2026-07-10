// URLs de donación del DEPLOYER (nunca de la plantilla). Sin valor por
// defecto: si no se configuran, la UI de donaciones se oculta — jamás debe
// enviarse dinero a una cuenta que no sea la de tu organización.
export const PAYPAL_DONATION_URL =
  process.env.NEXT_PUBLIC_PAYPAL_DONATION_URL ?? null;

export const STRIPE_DONATION_URL =
  process.env.NEXT_PUBLIC_STRIPE_DONATION_URL ?? null;

export const DONATIONS_ENABLED = Boolean(
  PAYPAL_DONATION_URL || STRIPE_DONATION_URL,
);

export const MIN_DONATION_CENTS = 100;
export const MAX_DONATION_CENTS = 1_000_000;
export const MONTHLY_DONATION_GOAL_CENTS = 80_000;

export const PLATFORM_MONTHLY_EXPENSES = [
  { label: "Servidores (AWS)", amountCents: 32_000 },
  { label: "Dominio + CDN", amountCents: 4_500 },
  { label: "SMS de alerta", amountCents: 21_000 },
  { label: "Soporte voluntario", amountCents: 22_500 },
] as const;

export interface Donation {
  id: string;
  name: string;
  amountCents: number;
  createdAt: number;
  status?: "intent" | "completed";
}

export interface DonationStats {
  count: number;
  totalCents: number;
  last24hCount: number;
  last24hCents: number;
}

export interface DonationMonthlyStats {
  raisedCents: number;
  goalCents: number;
}

export function validateDonationInput(input: {
  name?: unknown;
  amountCents?: unknown;
}): { ok: true; name: string; amountCents: number } | { ok: false; error: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length < 1 || name.length > 40) {
    return { ok: false, error: "El nombre debe tener entre 1 y 40 caracteres." };
  }

  const amountCents =
    typeof input.amountCents === "number"
      ? input.amountCents
      : Number.parseInt(String(input.amountCents ?? ""), 10);

  if (!Number.isInteger(amountCents)) {
    return { ok: false, error: "El monto debe ser un número entero en centavos." };
  }

  if (amountCents < MIN_DONATION_CENTS || amountCents > MAX_DONATION_CENTS) {
    return {
      ok: false,
      error: `El monto debe estar entre USD ${MIN_DONATION_CENTS / 100} y USD ${MAX_DONATION_CENTS / 100}.`,
    };
  }

  return { ok: true, name, amountCents };
}

export function formatDonationUsd(amountCents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
  }).format(amountCents / 100);
}
