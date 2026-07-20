import { defineConfig } from "vite";

export default defineConfig({
    // Relative base so the build works on GitHub Pages project sites.
    base: "./",
    build: {
        outDir: "dist",
    },
});
