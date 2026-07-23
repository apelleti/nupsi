import { describe, expect, it } from "vitest";
// @ts-expect-error - plain JS module, no types
import {
    PRESET_GROUPS,
    activeOptionID,
    applyOption,
    usableGroups,
} from "../src/presets.js";

// Roughly an Air75: every key the presets can touch.
const AIR75_IDS = [
    "lctrl",
    "lalt",
    "lmeta",
    "rctrl",
    "capslock",
    "q",
    "a",
    "w",
    "z",
    "m",
    "semicolon",
    "screenshot",
    "assistant",
    ...Array.from({ length: 12 }, (_, i) => `f${i + 1}`),
    "brightnessdown",
    "brightnessup",
    "backlightdown",
    "backlightup",
    "rewind",
    "playpause",
    "forward",
    "mute",
    "volumedown",
    "volumeup",
];

const ALL_IDS = {
    keys: new Set(AIR75_IDS),
    mackeys: new Set(AIR75_IDS),
};

const groupsByID = Object.fromEntries(
    usableGroups(PRESET_GROUPS, ALL_IDS).map((group: any) => [group.id, group]),
);

const empty = () => ({ keys: {}, mackeys: {} });

describe("presets", () => {
    it("starts on the default option of every group", () => {
        for (const group of Object.values(groupsByID) as any[]) {
            expect(activeOptionID(group, empty())).toBe(group.options[0].id);
        }
    });

    it("puts the Windows shortcut key next to the spacebar", () => {
        const config = applyOption(
            empty(),
            groupsByID["shortcut-modifier"],
            "cmd-position",
        );
        // lalt is the key next to the spacebar in the Windows keymap.
        expect(config.keys).toEqual({
            lalt: { key: "lctrl" },
            lctrl: { key: "lalt" },
        });
        expect(config.mackeys).toEqual({});
        expect(activeOptionID(groupsByID["shortcut-modifier"], config)).toBe(
            "cmd-position",
        );
    });

    it("switching options clears the previous one", () => {
        const group = groupsByID["shortcut-modifier"];
        const swapped = applyOption(empty(), group, "cmd-position");
        const back = applyOption(swapped, group, "ctrl-position");
        expect(back.keys).toEqual({});
        expect(back.mackeys).toEqual({
            lctrl: { key: "lmeta" },
            lmeta: { key: "lctrl" },
        });
        expect(applyOption(back, group, "default")).toEqual(empty());
    });

    it("swaps the AZERTY letters on both keymaps", () => {
        const config = applyOption(empty(), groupsByID["letters"], "azerty");
        for (const section of ["keys", "mackeys"] as const) {
            expect(config[section].q).toEqual({ key: "a" });
            expect(config[section].a).toEqual({ key: "q" });
            expect(config[section].w).toEqual({ key: "z" });
            expect(config[section].z).toEqual({ key: "w" });
            expect(config[section].semicolon).toEqual({ key: "m" });
            expect(config[section].m).toEqual({ key: "semicolon" });
        }
        expect(activeOptionID(groupsByID["letters"], config)).toBe("azerty");
    });

    it("uses ⌘ on Mac and Ctrl on Windows for a repurposed key", () => {
        const config = applyOption(
            empty(),
            groupsByID["assistant-key"],
            "copy",
        );
        expect(config.keys.assistant).toEqual({
            key: "c",
            modifiers: ["ctrl"],
        });
        expect(config.mackeys.assistant).toEqual({
            key: "c",
            modifiers: ["meta"],
        });
    });

    it("gives each repurposable key its own actions", () => {
        const config = applyOption(empty(), groupsByID["scissors-key"], "lock");
        // Only the ✂️ key moves; 🐱 and Right Ctrl are a different group.
        expect(Object.keys(config.keys)).toEqual(["screenshot"]);
        expect(config.keys.screenshot).toEqual({
            key: "l",
            modifiers: ["meta"],
        });
        expect(config.mackeys.screenshot).toEqual({
            key: "q",
            modifiers: ["ctrl", "meta"],
        });
        expect(activeOptionID(groupsByID["assistant-key"], config)).toBe(
            "default",
        );
    });

    it("swaps the F-row with its Fn layer, on Windows only", () => {
        const config = applyOption(empty(), groupsByID["f-row"], "media-first");
        expect(config.keys.f11).toEqual({ key: "volumedown" });
        expect(config.keys.volumedown).toEqual({ key: "f11" });
        // F3/F4 have nothing to promote: their Fn slots are empty on Windows.
        expect(config.keys.f3).toBeUndefined();
        expect(config.mackeys).toEqual({});
    });

    it("leaves keys it does not own alone", () => {
        const config = applyOption(
            { keys: { f1: { key: "f13" } }, mackeys: {} },
            groupsByID["capslock"],
            "esc",
        );
        expect(config.keys).toEqual({
            f1: { key: "f13" },
            capslock: { key: "esc" },
        });
    });

    it("reports a hand-edited key as no option at all", () => {
        const config = { keys: { capslock: { key: "f13" } }, mackeys: {} };
        expect(activeOptionID(groupsByID["capslock"], config)).toBe(null);
    });

    it("hides options the keyboard cannot run", () => {
        const air60ish = {
            keys: new Set(["lctrl", "lalt", "lmeta", "capslock"]),
            mackeys: new Set(["lctrl", "lalt", "lmeta", "capslock"]),
        };
        const ids = usableGroups(PRESET_GROUPS, air60ish).map(
            (group: any) => group.id,
        );
        // No screenshot/assistant/rctrl and no letter keys in this fake board.
        expect(ids).toEqual(["shortcut-modifier", "capslock"]);
    });
});
