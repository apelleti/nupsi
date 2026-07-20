import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    AIR75,
    ConfigError,
    buildKeymapsFromYaml,
    validateYamlKeymap,
} from "../src/index";

const exampleYml = readFileSync(
    join(__dirname, "..", "..", "..", "example.yml"),
    "utf8",
);

describe("example.yml (the shipped reference profile)", () => {
    it("validates for both modes on the Air75", () => {
        validateYamlKeymap(AIR75, exampleYml, "win");
        validateYamlKeymap(AIR75, exampleYml, "mac");
    });

    it("builds keymaps with the expected remaps applied", () => {
        const { win, mac } = buildKeymapsFromYaml(AIR75, exampleYml);
        expect(win.length).toBe(AIR75.defaultKeymap.win.length);
        expect(mac.length).toBe(AIR75.defaultKeymap.mac.length);

        // keys: capslock: esc
        const capslock = AIR75.indicesByKeyName.win["capslock"]!;
        expect(win[capslock]).toBe(AIR75.keycodesByKeyName["esc"]);

        // keys: screenshot: {key: s, modifiers: [meta, shift]}
        const screenshot = AIR75.indicesByKeyName.win["screenshot"]!;
        expect(win[screenshot]).toBe(
            (AIR75.keycodesByKeyName["s"]! |
                AIR75.modifiersByModifierName["meta"]! |
                AIR75.modifiersByModifierName["shift"]!) >>>
                0,
        );

        // Unmentioned keys keep their default.
        const tabIndex = AIR75.indicesByKeyName.win["tab"]!;
        expect(win[tabIndex]).toBe(AIR75.defaultKeymap.win[tabIndex]);
    });
});

describe("shorthand notation", () => {
    it("normalizes mac-only shorthand entries (C++ GUI unmarshall bug)", () => {
        // 'assistant: fnspace' appears only under mackeys; the Electron GUI
        // mis-normalized this case (ui/src/app.js iterated the wrong object).
        const { mac } = buildKeymapsFromYaml(
            AIR75,
            "mackeys:\n  assistant: fnspace\n",
        );
        const index = AIR75.indicesByKeyName.mac["assistant"]!;
        expect(mac[index]).toBe(AIR75.keycodesByKeyName["fnspace"]);
    });

    it("treats an empty or missing section as a no-op", () => {
        for (const yaml of ["", "keys:\n", "keys: null\n"]) {
            const { win } = buildKeymapsFromYaml(AIR75, yaml);
            expect(win).toEqual([...AIR75.defaultKeymap.win]);
        }
    });
});

describe("raw entries", () => {
    it("writes the raw word verbatim", () => {
        const { win } = buildKeymapsFromYaml(
            AIR75,
            "keys:\n  capslock:\n    raw: 0x12345678\n",
        );
        expect(win[AIR75.indicesByKeyName.win["capslock"]!]).toBe(0x12345678);
    });

    it("is rejected when rawOk is false (GUI mode)", () => {
        expect(() =>
            validateYamlKeymap(
                AIR75,
                "keys:\n  capslock:\n    raw: 0x1\n",
                "win",
                { rawOk: false },
            ),
        ).toThrow(/raw configurations are not supported by the Nupsi GUI/);
    });

    it("rejects out-of-range raw values", () => {
        expect(() =>
            buildKeymapsFromYaml(AIR75, "keys:\n  capslock:\n    raw: -1\n"),
        ).toThrow(ConfigError);
    });
});

describe("validation errors (message parity with C++)", () => {
    it("rejects unknown physical keys", () => {
        expect(() =>
            validateYamlKeymap(AIR75, "keys:\n  notakey: esc\n", "win"),
        ).toThrow(
            "Invalid config in keys: a key for 'notakey' does not exist in 'Windows' mode.",
        );
    });

    it("rejects unknown keycodes", () => {
        expect(() =>
            validateYamlKeymap(AIR75, "keys:\n  capslock: notacode\n", "win"),
        ).toThrow(
            "Invalid config in keys.capslock: a code for key 'notacode' was not found.",
        );
    });

    it("rejects unknown modifiers with the direction hint", () => {
        expect(() =>
            validateYamlKeymap(
                AIR75,
                "keys:\n  capslock:\n    key: a\n    modifiers: [lalt]\n",
                "win",
            ),
        ).toThrow(/make sure you're not adding a direction/);
    });

    it("rejects a non-map top level section", () => {
        expect(() =>
            validateYamlKeymap(AIR75, "keys: [a, b]\n", "win"),
        ).toThrow("Invalid config file: 'keys' is not a map.");
    });

    it("rejects non-array modifiers", () => {
        expect(() =>
            validateYamlKeymap(
                AIR75,
                "keys:\n  capslock:\n    key: a\n    modifiers: ctrl\n",
                "win",
            ),
        ).toThrow(
            "Invalid config in keys.capslock: modifiers is not an array.",
        );
    });

    it("mac-mode errors name the Mac mode", () => {
        expect(() =>
            validateYamlKeymap(AIR75, "mackeys:\n  notakey: esc\n", "mac"),
        ).toThrow(
            "Invalid config in mackeys: a key for 'notakey' does not exist in 'Mac' mode.",
        );
    });
});
