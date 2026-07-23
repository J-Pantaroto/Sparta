import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: "src/main/index.ts"
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: "src/preload/index.ts",
        output: {
          // Sandboxed renderers carregam o preload via um loader que nao
          // entende `import`/ESM (erro real: "Cannot use import statement
          // outside a module") mesmo com extensao .mjs - forca CJS
          // (.cjs, ignora o "type":"module" do package.json) pra carregar
          // de verdade dentro do processo renderer sandboxed.
          format: "cjs",
          entryFileNames: "[name].cjs"
        }
      }
    }
  },
  renderer: {
    plugins: [react()],
    root: "src/renderer"
  }
});
