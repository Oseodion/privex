import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uiRoot = path.resolve(__dirname, "src/ui");

/**
 * Vite serves and builds the static UI from src/ui.
 * Multi-page input so both the landing page and the app shell get full builds.
 */
export default defineConfig({
  root: uiRoot,
  base: "./",
  assetsInclude: ["**/*.wasm"],
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(uiRoot, "index.html"),
        app: path.resolve(uiRoot, "app.html"),
      },
    },
  },
});
