import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SITE_ROOT = resolve(__dirname, "../");
const PRODUCT_ROOT = resolve(SITE_ROOT, "public/images/product");

const EXPECTED_ASSETS = [
  "adaptive-theme.webp",
  "dashboard-adaptive.webp",
  "dashboard-sparta.webp",
  "personal-growth.webp"
];

const HTML_PAGES = ["index.html", "como-funciona.html", "funcionalidades.html"];

const SENSITIVE_MARKERS = [
  "Zekerus",
  "117",
  "srv1902513",
  "187.127.48.89",
  "C:\\Users\\",
  "sparta@"
];

function publicFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? publicFiles(path) : [path];
  });
}

describe("screenshots públicos do Desktop", () => {
  it("publica somente os quatro derivados WebP auditados", () => {
    expect(readdirSync(PRODUCT_ROOT).sort()).toEqual(EXPECTED_ASSETS);
    for (const name of EXPECTED_ASSETS) {
      const image = readFileSync(resolve(PRODUCT_ROOT, name));
      expect(extname(name)).toBe(".webp");
      expect(image.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(image.subarray(8, 12).toString("ascii")).toBe("WEBP");
      expect(statSync(resolve(PRODUCT_ROOT, name)).size).toBeLessThan(100_000);
    }
  });

  it("não preserva os screenshots JPEG antigos nem suas referências", () => {
    const html = HTML_PAGES.map((page) => readFileSync(resolve(SITE_ROOT, page), "utf8")).join(
      "\n"
    );
    expect(html).not.toMatch(/screenshot-(dashboard|champion-select|postgame)\.jpg/);
    const legacy = publicFiles(resolve(SITE_ROOT, "public")).filter((path) =>
      /screenshot-(dashboard|champion-select|postgame)\.jpg$/i.test(path)
    );
    expect(legacy).toEqual([]);
  });

  it("não contém os marcadores sensíveis conhecidos em nenhum arquivo público", () => {
    const findings: string[] = [];
    const auditedFiles = [
      ...publicFiles(resolve(SITE_ROOT, "public")),
      ...HTML_PAGES.map((page) => resolve(SITE_ROOT, page))
    ];
    for (const path of auditedFiles) {
      const bytes = readFileSync(path);
      for (const marker of SENSITIVE_MARKERS) {
        if (bytes.includes(Buffer.from(marker))) findings.push(`${path}: ${marker}`);
      }
    }
    expect(findings).toEqual([]);
  });

  it("reserva dimensões, prioriza só o Hero e usa lazy-load fora da primeira viewport", () => {
    const home = readFileSync(resolve(SITE_ROOT, "index.html"), "utf8");
    const allHtml = HTML_PAGES.map((page) => readFileSync(resolve(SITE_ROOT, page), "utf8")).join(
      "\n"
    );
    const productImages = allHtml.match(/<img\b[^>]*\/images\/product\/[^>]*>/g) ?? [];

    expect(productImages.length).toBeGreaterThanOrEqual(7);
    for (const image of productImages) {
      expect(image).toMatch(/width="1280"/);
      expect(image).toMatch(/height="860"/);
      expect(image).toMatch(/decoding="async"/);
    }

    const prioritized = productImages.filter((image) => /fetchpriority="high"/.test(image));
    expect(prioritized).toHaveLength(1);
    expect(home).toContain(prioritized[0]);
    for (const image of productImages.filter((image) => image !== prioritized[0])) {
      expect(image).toMatch(/loading="lazy"/);
    }
  });

  it("remove movimento decorativo quando o sistema pede redução de movimento", () => {
    const css = readFileSync(resolve(SITE_ROOT, "src/styles/site.css"), "utf8");
    const reducedMotion = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));

    expect(reducedMotion).toContain(".sp-product-crop img");
    expect(reducedMotion).toContain("transition: none");
    expect(reducedMotion).toContain(".sp-product-frame:hover .sp-product-crop img");
    expect(reducedMotion).toContain("transform: none");
  });
});
