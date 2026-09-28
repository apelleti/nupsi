import { AIR75, KeyboardDescriptor, KeyboardMode } from "@nupsi/core";
import { describe, expect, it } from "vitest";
// @ts-expect-error - plain JS module, no types
import keyboards from "../src/keyboards.js";

function encode(
    descriptor: KeyboardDescriptor,
    key: string,
    modifiers: string[],
): number {
    let word = descriptor.keycodesByKeyName[key]!;
    for (const modifier of modifiers) {
        word |= descriptor.modifiersByModifierName[modifier]!;
    }
    return word >>> 0;
}

// Air75 only: it is the board validated on hardware, and its factory keymap
// comes from real USB captures. Air60 and Halo75 still have known
// disagreements between their layouts and their data (see VALIDATION.md).
describe("Air75 layout matches its keymap data", () => {
    for (const mode of ["win", "mac"] as KeyboardMode[]) {
        it(`every remappable key (${mode}) has an index and the factory default`, () => {
            for (const row of keyboards.Air75.getLayout(mode)) {
                for (const key of row) {
                    if (!key.remappable) {
                        continue;
                    }
                    const entries: [string, string, string[]][] = [
                        [key.id, key.defaultMapping, key.defaultModifiers],
                    ];
                    if (key.altID) {
                        entries.push([
                            key.altID,
                            key.altDefaultMapping,
                            key.altDefaultModifiers,
                        ]);
                    }
                    for (const [id, mapping, modifiers] of entries) {
                        const index = AIR75.indicesByKeyName[mode][id];
                        expect(
                            index,
                            `${mode} ${id} has an index`,
                        ).toBeDefined();
                        expect(
                            encode(AIR75, mapping, modifiers),
                            `${mode} ${id} default`,
                        ).toBe(AIR75.defaultKeymap[mode][index!]! >>> 0);
                    }
                }
            }
        });
    }
});
