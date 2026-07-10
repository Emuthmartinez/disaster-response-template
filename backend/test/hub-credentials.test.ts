import "./helpers";
import { describe, expect, it } from "vitest";
import { HUB_PUBLIC_COLUMNS } from "@/services/hub-credentials";

function expectExcluded(columns: readonly string[], forbidden: string[]): void {
  for (const column of forbidden) expect(columns).not.toContain(column);
}

describe("hub SQL public grants", () => {
  it("usa allowlists de columnas y excluye PII", () => {
    expect(HUB_PUBLIC_COLUMNS).not.toHaveProperty("contact_messages");
    expectExcluded(HUB_PUBLIC_COLUMNS.donations, ["name", "ip_hash", "user_agent"]);
    expectExcluded(HUB_PUBLIC_COLUMNS.missing_persons, [
      "name", "contact", "description", "last_seen", "lat", "lng",
    ]);
    expectExcluded(HUB_PUBLIC_COLUMNS.unidentified_persons, [
      "name", "surname", "contact_name", "contact_phone", "photo",
    ]);
    expectExcluded(HUB_PUBLIC_COLUMNS.hospital_patients, [
      "name", "age", "condition", "notes", "contact", "document_hash",
    ]);
    expect(HUB_PUBLIC_COLUMNS.report_confirmations).not.toContain("ip_hash");
    expect(HUB_PUBLIC_COLUMNS.hospital_supply_needs).not.toContain("restricted_note");
    expect(HUB_PUBLIC_COLUMNS.hospital_supply_statuses).not.toContain("restricted_note");
  });
});
