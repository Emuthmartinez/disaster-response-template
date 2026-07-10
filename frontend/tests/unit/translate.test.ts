import { describe, expect, it } from "vitest";
import {
  apexCookieDomain,
  comboValueToLang,
  googTransCookieAssignments,
  googTransCookieValue,
  readGoogTransTarget,
} from "@/lib/translate";

describe("translate helpers", () => {
  it("googTransCookieValue respeta el contrato /es/<destino>", () => {
    expect(googTransCookieValue("es")).toBe("/es/es");
    expect(googTransCookieValue("en")).toBe("/es/en");
    expect(googTransCookieValue("pt")).toBe("/es/pt");
  });

  it("readGoogTransTarget parsea el cookie googtrans", () => {
    expect(readGoogTransTarget("")).toBe("es");
    expect(readGoogTransTarget("googtrans=/es/en")).toBe("en");
    expect(readGoogTransTarget("foo=1; googtrans=/es/pt; bar=2")).toBe("pt");
    expect(readGoogTransTarget("googtrans=/es/es")).toBe("es");
  });

  it("apexCookieDomain usa eTLD+1 y omite localhost", () => {
    expect(apexCookieDomain("localhost")).toBeNull();
    expect(apexCookieDomain("example.org")).toBe(".example.org");
    expect(apexCookieDomain("www.example.org")).toBe(".example.org");
  });

  it("googTransCookieAssignments incluye dominio apex cuando aplica", () => {
    expect(
      googTransCookieAssignments("/es/en", "www.example.org"),
    ).toEqual([
      "googtrans=/es/en;max-age=31536000;path=/",
      "googtrans=/es/en;max-age=31536000;path=/;domain=.example.org",
    ]);
  });

  it("comboValueToLang interpreta el value del combo GT", () => {
    expect(comboValueToLang("")).toBe("es");
    expect(comboValueToLang("es")).toBe("es");
    expect(comboValueToLang("pt")).toBe("pt");
  });
});
