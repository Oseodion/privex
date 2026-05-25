import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, ".");

/**
 * Vite root is the repository root so /src/*.ts modules linked from HTML resolve correctly.
 * Multi-page HTML entry points live under src/ui/.
 */
export default defineConfig({
  root: repoRoot,
  base: "/",
  assetsInclude: ["**/*.wasm", "**/*.masp"],
  build: {
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
