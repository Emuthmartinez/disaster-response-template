import { describe, expect, it } from "vitest";
import { readSessionToken, SESSION_COOKIE } from "@/src/shared/auth/session-cookie";

function reqWithCookie(cookie: string): Request {
  return new Request("http://admin.local/api/x", { headers: { cookie } });
}

describe("session-cookie", () => {
  it("lee el JWT del header Cookie", () => {
    const req = reqWithCookie(`${SESSION_COOKIE}=abc.def.ghi`);
    expect(readSessionToken(req)).toBe("abc.def.ghi");
  });

  it("encuentra la cookie entre varias", () => {
    const req = reqWithCookie(`foo=1; ${SESSION_COOKIE}=tok123; bar=2`);
    expect(readSessionToken(req)).toBe("tok123");
  });

  it("devuelve null si no está la cookie de sesión", () => {
    expect(readSessionToken(reqWithCookie("foo=1; bar=2"))).toBeNull();
  });

  it("devuelve null sin header Cookie", () => {
    expect(readSessionToken(new Request("http://admin.local/"))).toBeNull();
  });

  it("decodifica valores url-encoded", () => {
    const req = reqWithCookie(`${SESSION_COOKIE}=a%2Bb%3Dc`);
    expect(readSessionToken(req)).toBe("a+b=c");
  });
});
