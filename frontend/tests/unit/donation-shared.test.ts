import { describe, it, expect } from "vitest";
import {
  validateDonationInput,
  formatDonationUsd,
  MIN_DONATION_CENTS,
  MAX_DONATION_CENTS,
} from "@/lib/donation-shared";

describe("validateDonationInput", () => {
  it("acepta entrada válida y recorta el nombre", () => {
    const r = validateDonationInput({ name: "  Ana  ", amountCents: 2500 });
    expect(r).toEqual({ ok: true, name: "Ana", amountCents: 2500 });
  });

  it("acepta amountCents como string numérico", () => {
    const r = validateDonationInput({ name: "Ana", amountCents: "2500" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.amountCents).toBe(2500);
  });

  it("rechaza nombre vacío o demasiado largo", () => {
    expect(validateDonationInput({ name: "", amountCents: 2500 }).ok).toBe(false);
    expect(validateDonationInput({ name: "   ", amountCents: 2500 }).ok).toBe(false);
    expect(
      validateDonationInput({ name: "a".repeat(41), amountCents: 2500 }).ok,
    ).toBe(false);
  });

  it("rechaza montos no enteros", () => {
    expect(validateDonationInput({ name: "Ana", amountCents: 25.5 }).ok).toBe(false);
    expect(validateDonationInput({ name: "Ana", amountCents: "abc" }).ok).toBe(false);
  });

  it("respeta los límites MIN/MAX de forma inclusiva", () => {
    expect(
      validateDonationInput({ name: "Ana", amountCents: MIN_DONATION_CENTS }).ok,
    ).toBe(true);
    expect(
      validateDonationInput({ name: "Ana", amountCents: MAX_DONATION_CENTS }).ok,
    ).toBe(true);
    expect(
      validateDonationInput({ name: "Ana", amountCents: MIN_DONATION_CENTS - 1 }).ok,
    ).toBe(false);
    expect(
      validateDonationInput({ name: "Ana", amountCents: MAX_DONATION_CENTS + 1 }).ok,
    ).toBe(false);
  });
});

describe("formatDonationUsd", () => {
  it("omite decimales en montos redondos", () => {
    expect(formatDonationUsd(2500)).toBe("$25");
  });

  it("muestra 2 decimales cuando hay centavos", () => {
    expect(formatDonationUsd(2550)).toBe("$25.50");
  });
});
