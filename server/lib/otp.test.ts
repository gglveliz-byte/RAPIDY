import { describe, expect, it } from "vitest";
import { normalizePhone } from "./otp";

describe("normalizePhone", () => {
  it("normaliza el formato del PhoneInput ecuatoriano quitando el 0 inicial", () => {
    expect(normalizePhone("+593 0991234567")).toBe("593991234567");
    expect(normalizePhone("+593 99 123 4567")).toBe("593991234567");
  });

  it("normaliza números locales ecuatorianos", () => {
    expect(normalizePhone("0991234567")).toBe("593991234567");
    expect(normalizePhone("991234567")).toBe("593991234567");
  });

  it("conserva números internacionales", () => {
    expect(normalizePhone("+54 9 11 1234-5678")).toBe("5491112345678");
  });

  it("rechaza números demasiado cortos", () => {
    expect(() => normalizePhone("123")).toThrow();
  });
});