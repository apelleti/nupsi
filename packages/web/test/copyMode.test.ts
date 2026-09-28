import {
    AIR60,
    AIR75,
    HALO75,
    KeyboardDescriptor,
    KeyboardMode,
    buildKeymapsFromYaml,
} from "@nupsi/core";
import YAML from "yaml";
import { describe, expect, it } from "vitest";
import { Config, Layout, copyKeymap } from "../src/copyMode.js";
// @ts-expect-error - plain JS module, no types
import keyboards from "../src/keyboards.js";

const BOARDS: [string, KeyboardDescriptor][] = [
    ["Air60", AIR60],
    ["Air75", AIR75],
    ["Halo75", HALO75],
];

function layouts(kind: string): Record<KeyboardMode, Layout> {
    return {
        win: keyboards[kind].getLayout("win"),
        mac: keyboards[kind].getLayout("mac"),
    };
}

/** Word each physical key sends in `mode`, keyed by its Windows-layout id. */
function physicalWords(
    kind: string,
    descriptor: KeyboardDescriptor,
    config: Config,
    mode: KeyboardMode,
): Map<string, number> {
    const keymap = buildKeymapsFromYaml(
        descriptor,
        YAML.stringify({ keys: {}, mackeys: {}, ...config }),
        { rawOk: true },
    )[mode];
    const words = new Map<string, number>();
    const { win } = layouts(kind);
    const own = layouts(kind)[mode];
    win.forEach((row, r) =>
        row.forEach((winKey, c) => {
            const key = own[r]![c]!;
            if (!winKey.remappable) {
                return;
            }
            const ids: [string, string][] = [[winKey.id, key.id]];
            if (winKey.altID && key.altID) {
                ids.push([winKey.altID, key.altID]);
            }
            for (const [label, id] of ids) {
                const index = descriptor.indicesByKeyName[mode][id];
                if (index !== undefined) {
                    words.set(label, keymap[index]!);
                }
            }
        }),
    );
    return words;
}

describe("copyKeymap", () => {
    const config: Config = {
        keys: {
            capslock: { key: "esc" },
            lalt: { key: "lctrl", modifiers: ["shift"] },
            q: { key: "a", modifiers: ["ctrl"] },
            tab: { raw: 0x12345678 },
        },
        mackeys: { w: { key: "z" } },
    };

    for (const [kind, descriptor] of BOARDS) {
        for (const [from, to] of [
            ["win", "mac"],
            ["mac", "win"],
        ] as [KeyboardMode, KeyboardMode][]) {
            it(`${kind}: ${from} -> ${to} makes every physical key send the same word`, () => {
                const copied = copyKeymap(
                    descriptor,
                    layouts(kind),
                    config,
                    from,
                    to,
                );
                const source = physicalWords(kind, descriptor, config, from);
                const result = physicalWords(kind, descriptor, copied, to);
                for (const [label, word] of source) {
                    expect(result.get(label), `${kind} ${label}`).toBe(word);
                }
                // The source keymap is untouched.
                const section = from === "win" ? "keys" : "mackeys";
                expect(copied[section]).toEqual(config[section]);
            });
        }
    }

    it("pairs keys physically, not by name (Air75 Alt/Cmd)", () => {
        const copied = copyKeymap(
            AIR75,
            layouts("Air75"),
            { keys: {}, mackeys: {} },
            "win",
            "mac",
        );
        // Left of Space: lalt on Windows, lmeta on Mac. The Mac key must
        // now send Alt, and its neighbour Cmd, as on Windows.
        expect(copied.mackeys!.lmeta).toEqual({ key: "lalt" });
        expect(copied.mackeys!.lalt).toEqual({ key: "lmeta" });
        // Letters are identical on both sides: no remap needed.
        expect(copied.mackeys!.a).toBeUndefined();
    });

    it("carries raw words and the Fn layer over", () => {
        const copied = copyKeymap(
            AIR75,
            layouts("Air75"),
            {
                keys: {
                    capslock: { raw: 0x12345678 },
                    brightnessdown: { key: "mute" },
                },
                mackeys: {},
            },
            "win",
            "mac",
        );
        expect(copied.mackeys!.capslock).toEqual({ raw: 0x12345678 });
        expect(copied.mackeys!.fn_f1).toEqual({ key: "mute" });
    });

    it("copies slots the layouts don't show, by name (Air60 F-row)", () => {
        const copied = copyKeymap(
            AIR60,
            layouts("Air60"),
            {
                keys: { f1: { key: "mute" }, pgup: { key: "home" } },
                mackeys: {},
            },
            "win",
            "mac",
        );
        // Neither key is drawn in the Air60 layout (it has no F-row), but
        // both slots exist in both modes under the same name.
        expect(copied.mackeys!.f1).toEqual({ key: "mute" });
        expect(copied.mackeys!.pgup).toEqual({ key: "home" });
    });

    it("leaves the target alone when both keymaps already match", () => {
        const config: Config = {
            keys: { capslock: { key: "esc" } },
            mackeys: { capslock: { key: "esc" } },
        };
        // Halo75's factory Win and Mac keymaps differ, so only compare the
        // second copy to the first: copying is idempotent.
        const once = copyKeymap(
            HALO75,
            layouts("Halo75"),
            config,
            "win",
            "mac",
        );
        const twice = copyKeymap(HALO75, layouts("Halo75"), once, "win", "mac");
        expect(twice).toEqual(once);
    });
});
