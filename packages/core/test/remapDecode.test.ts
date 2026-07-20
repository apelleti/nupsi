import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AIR75, buildKeymapsFromYaml, remapsFromKeymap } from "../src/index";

const exampleYml = readFileSync(
    join(__dirname, "..", "..", "..", "example.yml"),
    "utf8",
);

describe("remapsFromKeymap (decoding on-keyboard state)", () => {
    it("returns no remaps for the default keymap", () => {
        for (const mode of ["win", "mac"] as const) {
            expect(
                remapsFromKeymap(AIR75, AIR75.defaultKeymap[mode], mode),
            ).toEqual({});
        }
    });

    it("round-trips example.yml through encode then decode", () => {
        const keymaps = buildKeymapsFromYaml(AIR75, exampleYml);
        for (const mode of ["win", "mac"] as const) {
            const decoded = remapsFromKeymap(AIR75, keymaps[mode], mode);
            // Re-encoding the decoded remaps must reproduce the same keymap.
            const yaml = JSON.stringify({
                [mode === "mac" ? "mackeys" : "keys"]: decoded,
            });
            const reEncoded = buildKeymapsFromYaml(AIR75, yaml)[mode];
            expect(reEncoded).toEqual(keymaps[mode]);
        }
    });

    it("decodes a plain remap to its key name", () => {
        const keymap = [...AIR75.defaultKeymap.win];
        keymap[AIR75.indicesByKeyName.win["capslock"]!] =
            AIR75.keycodesByKeyName["esc"]!;
        expect(remapsFromKeymap(AIR75, keymap, "win")).toEqual({
            capslock: { key: "esc" },
        });
    });

    it("decomposes modifier combinations", () => {
        const keymap = [...AIR75.defaultKeymap.win];
        const word =
            (AIR75.keycodesByKeyName["s"]! |
                AIR75.modifiersByModifierName["meta"]! |
                AIR75.modifiersByModifierName["shift"]!) >>>
            0;
        keymap[AIR75.indicesByKeyName.win["screenshot"]!] = word;
        const decoded = remapsFromKeymap(AIR75, keymap, "win");
        const entry = decoded["screenshot"] as {
            key: string;
            modifiers: string[];
        };
        expect(entry.key).toBe("s");
        expect([...entry.modifiers].sort()).toEqual(["meta", "shift"]);
    });

    it("falls back to raw for unknown words", () => {
        const keymap = [...AIR75.defaultKeymap.win];
        keymap[AIR75.indicesByKeyName.win["capslock"]!] = 0xdeadbeef;
        expect(remapsFromKeymap(AIR75, keymap, "win")).toEqual({
            capslock: { raw: 0xdeadbeef },
        });
    });

    it("decodes the real F-row customization pattern (F1-F12 first)", () => {
        // The pattern observed on real hardware during validation.
        const keymap = [...AIR75.defaultKeymap.win];
        const f1 = AIR75.keycodesByKeyName["f1"]!;
        keymap[AIR75.indicesByKeyName.win["brightnessdown"]!] = f1;
        const decoded = remapsFromKeymap(AIR75, keymap, "win");
        expect(decoded["brightnessdown"]).toEqual({ key: "f1" });
    });
});
