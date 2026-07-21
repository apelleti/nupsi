import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
    // Relative base so the build works under any path / host.
    base: "./",
    build: {
        // Emit to a `dist/` at the repo root so Vercel finds it as the default
        // output directory (its per-project setting can override vercel.json's
        // outputDirectory, so we don't rely on that).
        outDir: fileURLToPath(new URL("../../dist", import.meta.url)),
        emptyOutDir: true,
    },
});
