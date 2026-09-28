import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        // Test the web app against @nupsi/core's sources, not its last build,
        // so a data or core change is picked up without `pnpm build` first.
        alias: {
            "@nupsi/core": fileURLToPath(
                new URL("./packages/core/src/index.ts", import.meta.url),
            ),
        },
    },
    test: {
        include: ["packages/*/test/**/*.test.ts"],
    },
});
