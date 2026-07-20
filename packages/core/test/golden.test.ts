/*
    Golden tests: the TypeScript encoder must produce byte-for-byte the same
    keymaps as the C++ implementation. The reference data is the annotated
    hex dumps in util/usb/, which were captured from real keyboards with the
    C++ CLI (`nudelta -D ... -H ...`) and are the source the res/ YAML data
    was derived from.
*/
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    AIR60,
    AIR75,
    HALO75,
    KeyboardDescriptor,
    KeyboardMode,
    parseAnnotatedHex,
    parseKeymapWords,
    prettyPrintBinary,
    serializeKeymapWords,
} from "../src/index";

const usbDir = join(__dirname, "..", "..", "..", "util", "usb");

const GOLDEN_DUMPS: [KeyboardDescriptor, KeyboardMode, string][] = [
    [AIR75, "win", "Air75_win.annotated.hex"],
    [AIR75, "mac", "Air75_mac.annotated.hex"],
    [HALO75, "win", "Halo75_win.annotated.hex"],
    [HALO75, "mac", "Halo75_mac.annotated.hex"],
    [AIR60, "mac", "Air60_mac.annotated.hex"],
];

describe("default keymaps match the C++-captured golden dumps", () => {
    for (const [descriptor, mode, file] of GOLDEN_DUMPS) {
        it(`${descriptor.name} (${mode}) == ${file}`, () => {
            const golden = parseAnnotatedHex(
                readFileSync(join(usbDir, file), "utf8"),
            );
            const encoded = serializeKeymapWords(
                descriptor.defaultKeymap[mode],
            );
            expect(encoded).toEqual(golden);
        });
    }
});

describe("serialization round-trips", () => {
    it("parseKeymapWords inverts serializeKeymapWords", () => {
        const words = [0x29000000, 0xe1000006, 0x00080000, 0xffffffff, 0];
        expect(parseKeymapWords(serializeKeymapWords(words))).toEqual(words);
    });

    it("parseAnnotatedHex inverts prettyPrintBinary", () => {
        const bytes = serializeKeymapWords(AIR75.defaultKeymap.win);
        expect(parseAnnotatedHex(prettyPrintBinary(bytes))).toEqual(bytes);
    });

    it("golden dumps are whole numbers of words", () => {
        for (const [, , file] of GOLDEN_DUMPS) {
            const golden = parseAnnotatedHex(
                readFileSync(join(usbDir, file), "utf8"),
            );
            expect(golden.length % 4).toBe(0);
            expect(golden.length).toBeGreaterThan(0);
        }
    });
});
