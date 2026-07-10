import { describe, it, expect } from "vitest";
import { qk } from "@/lib/query-keys";

// La dedup/invalidación de TanStack depende de igualdad de queryKey. Estos tests
// fijan la forma de las claves: dos llamadas con el mismo input → clave igual.

describe("qk (queryKeys)", () => {
  it("expone claves de prefijo estables", () => {
    expect(qk.reports.all).toEqual(["reports"]);
    expect(qk.missing.stats).toEqual(["missing", "stats"]);
    expect(qk.hospitals.all).toEqual(["hospitals"]);
  });

  it("missing.list incrusta los params y es igual para inputs iguales", () => {
    const a = qk.missing.list({ status: "active", page: 1, pageSize: 20 });
    const b = qk.missing.list({ status: "active", page: 1, pageSize: 20 });
    expect(a).toEqual(b);
    expect(a).toEqual(["missing", "list", { status: "active", page: 1, pageSize: 20 }]);
  });

  it("hospitals.patients/supplies se parametrizan por id", () => {
    expect(qk.hospitals.patients("DEMO-hosp-3")).toEqual([
      "hospitals",
      "DEMO-hosp-3",
      "patients",
    ]);
    expect(qk.hospitals.supplies("DEMO-hosp-3")).toEqual([
      "hospitals",
      "DEMO-hosp-3",
      "supplies",
    ]);
  });

  it("missing.map admite null (sin bounds)", () => {
    expect(qk.missing.map(null)).toEqual(["missing", "map", null]);
  });
});
