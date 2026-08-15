import { describe, expect, it } from "vitest";
import { readableAccentText, readableInkOnAccent } from "./accent-color";

/**
 * Luminancia relativa (WCAG 2.x) reimplementada AQUI de proposito, a partir
 * da especificacao, em vez de importada de `accent-color.ts`: reusar a
 * funcao interna faria o teste concordar consigo mesmo mesmo que os dois
 * lados estivessem errados juntos. Esta copia e a referencia independente.
 */
function relativeLuminance(red: number, green: number, blue: number): number {
  const channel = (value: number): number => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

/** `hsl(H S% L%)` -> RGB 0-255, seguindo a conversao padrao de HSL. */
function parseHsl(value: string): [number, number, number] {
  const match = /^hsl\((\d+(?:\.\d+)?) (\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%\)$/.exec(value);
  if (!match) throw new Error(`formato inesperado: ${value}`);
  const hue = Number(match[1]) / 360;
  const saturation = Number(match[2]) / 100;
  const lightness = Number(match[3]) / 100;
  if (saturation === 0) {
    const gray = Math.round(lightness * 255);
    return [gray, gray, gray];
  }
  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const toChannel = (t: number): number => {
    let position = t;
    if (position < 0) position += 1;
    if (position > 1) position -= 1;
    if (position < 1 / 6) return p + (q - p) * 6 * position;
    if (position < 1 / 2) return q;
    if (position < 2 / 3) return p + (q - p) * (2 / 3 - position) * 6;
    return p;
  };
  return [
    Math.round(toChannel(hue + 1 / 3) * 255),
    Math.round(toChannel(hue) * 255),
    Math.round(toChannel(hue - 1 / 3) * 255)
  ];
}

/** `--surface-2` (#0f0f13): a superficie mais clara sob esse texto. */
const SURFACE_LUMINANCE = relativeLuminance(0x0f, 0x0f, 0x13);

function contrast(color: string): number {
  const [red, green, blue] = parseHsl(color);
  const luminance = relativeLuminance(red, green, blue);
  const lighter = Math.max(luminance, SURFACE_LUMINANCE);
  const darker = Math.min(luminance, SURFACE_LUMINANCE);
  return (lighter + 0.05) / (darker + 0.05);
}

function lightnessOf(color: string): number {
  return Number(/(\d+(?:\.\d+)?)%\)$/.exec(color)![1]);
}

function hueOf(color: string): number {
  return Number(/^hsl\((\d+(?:\.\d+)?)/.exec(color)![1]);
}

describe("readableAccentText", () => {
  /**
   * A garantia central. A faixa travada do accent (S>=55%, L 45%-62%,
   * `extractAccentPalette`) mantem a cor visivel como PREENCHIMENTO, mas nao
   * como TEXTO - foi o que motivou o token separado. Este teste percorre a
   * faixa inteira e falha se qualquer combinacao voltar a produzir texto
   * abaixo de AA.
   */
  it("garante 4.5:1 sobre a superficie escura em toda a faixa travada do accent", () => {
    const reprovados: string[] = [];
    for (let hue = 0; hue < 360; hue += 5) {
      for (let saturation = 55; saturation <= 100; saturation += 5) {
        for (let lightness = 45; lightness <= 62; lightness += 1) {
          const color = readableAccentText(hue, saturation / 100, lightness / 100);
          if (contrast(color) < 4.5) reprovados.push(`${color} -> ${contrast(color).toFixed(2)}:1`);
        }
      }
    }
    expect(reprovados).toEqual([]);
  });

  it("preserva a matiz e a saturacao da skin - so a luminosidade sobe", () => {
    // Azul saturado e escuro: o pior caso medido (2.06:1 como texto cru).
    const color = readableAccentText(240, 0.55, 0.45);
    expect(hueOf(color)).toBe(240);
    expect(color).toContain("55%");
    expect(lightnessOf(color)).toBeGreaterThan(45);
  });

  it("nao clareia uma cor que ja passa, pra nao lavar o destaque sem motivo", () => {
    // Amarelo em L=62% ja da ~12:1 - nao deve ser alterado.
    const color = readableAccentText(60, 0.55, 0.62);
    expect(lightnessOf(color)).toBe(62);
  });

  it("sobe mais em matizes escuras que em claras", () => {
    const azul = lightnessOf(readableAccentText(240, 0.6, 0.45));
    const amarelo = lightnessOf(readableAccentText(60, 0.6, 0.45));
    expect(azul).toBeGreaterThan(amarelo);
  });

  it("respeita o teto de luminosidade em vez de chegar ao branco puro", () => {
    const color = readableAccentText(240, 1, 0.05);
    expect(lightnessOf(color)).toBeLessThanOrEqual(95);
  });
});

describe("readableInkOnAccent", () => {
  function hexLuminance(hex: string): number {
    const c = hex.replace("#", "");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
    return relativeLuminance(r, g, b);
  }

  function contrastOnFill(ink: string, hue: number, saturation: number, lightness: number): number {
    const [r, g, b] = parseHsl(`hsl(${hue} ${saturation * 100}% ${lightness * 100}%)`);
    const fill = relativeLuminance(r, g, b);
    const text = hexLuminance(ink);
    return (Math.max(fill, text) + 0.05) / (Math.min(fill, text) + 0.05);
  }

  /**
   * A garantia que o valor fixo anterior nao dava: com tinta escura sempre,
   * o pior caso da faixa travada media 2.04:1. Escolhendo por medicao, o
   * pior caso passa AA.
   */
  it("mantem >=4.5:1 sobre o preenchimento em toda a faixa travada", () => {
    const reprovados: string[] = [];
    for (let hue = 0; hue < 360; hue += 5) {
      for (let saturation = 55; saturation <= 100; saturation += 5) {
        for (let lightness = 45; lightness <= 62; lightness += 1) {
          const ink = readableInkOnAccent(hue, saturation / 100, lightness / 100);
          const r = contrastOnFill(ink, hue, saturation / 100, lightness / 100);
          if (r < 4.5) reprovados.push(`h${hue} s${saturation} l${lightness} ${ink} -> ${r.toFixed(2)}`);
        }
      }
    }
    expect(reprovados).toEqual([]);
  });

  it("escolhe tinta clara em accent escuro e escura em accent claro", () => {
    expect(readableInkOnAccent(240, 0.6, 0.45)).toBe("#ffffff");
    expect(readableInkOnAccent(60, 0.6, 0.62)).toBe("#000000");
  });
});
