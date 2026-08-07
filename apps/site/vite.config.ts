import { resolve } from "node:path";
import { defineConfig } from "vite";

/**
 * Site institucional estatico - multi-page, sem framework de UI. Cada HTML e
 * um entry point proprio; o layout compartilhado (nav/rodape/disclaimer) vem
 * de src/scripts/layout.ts, importado por todas as paginas, para nao
 * duplicar markup em 9 arquivos sem introduzir um gerador de site.
 */
const root = __dirname;

export default defineConfig({
  root,
  publicDir: "public",
  server: { port: 5174 },
  preview: { port: 5174 },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(root, "index.html"),
        comoFunciona: resolve(root, "como-funciona.html"),
        funcionalidades: resolve(root, "funcionalidades.html"),
        privacidade: resolve(root, "privacidade.html"),
        termos: resolve(root, "termos.html"),
        excluirConta: resolve(root, "excluir-conta.html"),
        seguranca: resolve(root, "seguranca.html"),
        status: resolve(root, "status.html"),
        notFound: resolve(root, "404.html")
      }
    }
  }
});
