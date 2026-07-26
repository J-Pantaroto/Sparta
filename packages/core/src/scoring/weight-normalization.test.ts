import { describe, expect, it } from "vitest";
import { normalizeWeightsByAvailability } from "./weight-normalization.js";

describe("normalizeWeightsByAvailability", () => {
  const weights = { a: 0.5, b: 0.3, c: 0.2 };

  it("mantém os pesos quando tudo tem dado", () => {
    const { normalizedWeights, dataCoverage } = normalizeWeightsByAvailability(weights, () => true);
    expect(dataCoverage).toBeCloseTo(1, 5);
    expect(normalizedWeights).toEqual(weights);
  });

  it("redistribui o peso do sinal ausente entre os restantes", () => {
    const { normalizedWeights, dataCoverage } = normalizeWeightsByAvailability(weights, (key) => key !== "c");
    expect(dataCoverage).toBeCloseTo(0.8, 5);
    expect(normalizedWeights.a).toBeCloseTo(0.625, 5);
    expect(normalizedWeights.b).toBeCloseTo(0.375, 5);
    // O ausente sai do calculo em vez de entrar valendo zero.
    expect(normalizedWeights.c).toBe(0);
    expect(normalizedWeights.a + normalizedWeights.b + normalizedWeights.c).toBeCloseTo(1, 5);
  });

  it("não produz NaN nem Infinity quando nada tem dado", () => {
    const { normalizedWeights, dataCoverage } = normalizeWeightsByAvailability(weights, () => false);
    expect(dataCoverage).toBe(0);
    Object.values(normalizedWeights).forEach((weight) => {
      expect(Number.isFinite(weight)).toBe(true);
      expect(weight).toBe(0);
    });
  });

  it("peso que já era zero continua zero mesmo com dado", () => {
    const { normalizedWeights } = normalizeWeightsByAvailability({ a: 1, b: 0 }, () => true);
    expect(normalizedWeights.b).toBe(0);
    expect(normalizedWeights.a).toBeCloseTo(1, 5);
  });
});
