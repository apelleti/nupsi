import { defineConfig } from "vite";

export default defineConfig({
    // Relative base so the build works under any path / host.
    base: "./",
    build: {
        outDir: "dist",
    },
});
