import { defineConfig } from "vitest/config";

/**
 * `layout.ts` roda `mount()` no carregamento do modulo (referencia
 * `document`) - precisa de jsdom mesmo pra testar as funcoes puras que nao
 * tocam o DOM (`renderFooter`, `RIOT_DISCLAIMER`), porque o import do
 * arquivo por si so ja executa esse efeito de topo de nivel.
 */
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"]
  }
});
