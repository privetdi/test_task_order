import { describe, expect, it } from "vitest";
import { fromKop, parseRub, toKop, roundKop, discountedKop } from "../src/utils/money.js";

describe("parseRub", () => {
  it("принимает число и строку с числом", () => {
    expect(parseRub(2500)).toBe(2500);
    expect(parseRub("2500.00")).toBe(2500);
    expect(parseRub(" 99 ")).toBe(99);
  });

  it("отклоняет мусор и отрицательные суммы", () => {
    expect(() => parseRub("abc")).toThrow();
    expect(() => parseRub(null)).toThrow();
    expect(() => parseRub(-1)).toThrow();
  });
});

describe("toKop / fromKop", () => {
  it("рубли в копейки", () => {
    expect(toKop(2500)).toBe(250000);
    expect(toKop(99)).toBe(9900);
  });

  it("отбрасывает доли копейки", () => {
    expect(toKop(10.999)).toBe(1099);
  });

  it("копейки в рубли", () => {
    expect(fromKop(250000)).toBe(2500);
    expect(fromKop(1099)).toBe(10.99);
  });
});


describe("decimal precision", () => {
  it("не теряет копейку из-за двоичного представления", () => {
    expect(toKop(1.15)).toBe(115);
    expect(toKop(19.99)).toBe(1999);
    expect(toKop(0.29)).toBe(29);
    expect(toKop(1e-7)).toBe(0);
    expect(roundKop(1.005)).toBe(101);
    expect(roundKop(0.004)).toBe(0);
    expect(() => toKop(Number.MAX_SAFE_INTEGER)).toThrow();
  });
});


describe("discountedKop", () => {
  it("округляет скидку без промежуточных ошибок float", () => {
    expect(discountedKop(1, 50)).toBe(1);
    expect(discountedKop(1999, 7)).toBe(1859);
    expect(discountedKop(10000, 12.345)).toBe(8766);
    expect(discountedKop(100, 100)).toBe(0);
    expect(discountedKop(Number.MAX_SAFE_INTEGER, 0)).toBe(Number.MAX_SAFE_INTEGER);
  });
});
