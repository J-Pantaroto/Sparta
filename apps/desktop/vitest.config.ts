import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Ambiente de teste do renderer. Existe a partir da Etapa 2 (contrato de
 * origem/disponibilidade): a regra "ausência não vira barra" é uma decisão
 * de interface, então precisa de teste de interface pra não regredir em
 * silêncio.
 *
 * `jsdom` só no diretório do renderer - main e preload são Node e não têm
 * teste próprio hoje.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@sparta/core": resolve(__dirname, "../../packages/core/src/index.ts"),
      "@sparta/riot": resolve(__dirname, "../../packages/riot/src/index.ts")
    }
  },
  test: {
    environment: "jsdom",
    // `globals: true` e o que faz o @testing-library/react registrar o
    // cleanup automatico entre testes. Sem isso o DOM acumulava de um teste
    // pro seguinte, e uma asserção de ausência podia passar (ou falhar) por
    // causa do render anterior - achado ao escrever os testes da Etapa 4.
    globals: true,
    include: ["src/renderer/**/*.test.{ts,tsx}"],
    css: true
  }
});
