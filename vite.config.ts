import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, ".");

/**
 * Vite root is the repository root so /src/*.ts modules linked from HTML resolve correctly.
 * Multi-page HTML entry points live under src/ui/.
 */
export default defineConfig({
  plugins: [wasm(), topLevelAwait()],
  root: repoRoot,
  base: "/",
  assetsInclude: ["**/*.wasm", "**/*.masp"],
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  build: {
    target: "esnext",
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: path.resolve(repoRoot, "index.html"),
        app: path.resolve(repoRoot, "src/ui/app.html"),
      },
    },
  },
});
